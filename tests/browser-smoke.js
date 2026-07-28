const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const port = Number(process.argv[2] || 9222);
const root = path.resolve(__dirname, "..");

class CdpClient {
  constructor(url) {
    this.url = url;
    this.sequence = 0;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async connect() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }
      (this.listeners.get(message.method) || []).forEach((listener) => listener(message.params));
    });
  }

  send(method, params = {}) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) || [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  close() {
    this.socket.close();
  }
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function evaluate(client, expression) {
  const response = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description || "Browser evaluation failed");
  }
  return response.result.value;
}

async function screenshot(client, filename) {
  const capture = await client.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  fs.writeFileSync(path.join(__dirname, filename), Buffer.from(capture.data, "base64"));
}

async function navigate(client, url) {
  await client.send("Page.navigate", { url });
  await wait(700);
}

async function testDashboard(client, errors) {
  await client.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      globalThis.chrome = {
        storage: {
          local: {
            get: async () => ({
              settings: {
                enabled: true,
                interval: 30,
                questionCount: 6,
                skills: { addition: true, subtraction: true, multiplication: true, division: true, digits: true, sentence: true }
              },
              profiles: {
                addition: { level: 4, mastery: 3, correct: 18, attempts: 20, streak: 5, bestStreak: 8 },
                subtraction: { level: 3, mastery: 5, correct: 13, attempts: 17, streak: 2, bestStreak: 5 },
                multiplication: { level: 5, mastery: 2, correct: 20, attempts: 25, streak: 3, bestStreak: 7 },
                division: { level: 3, mastery: 1, correct: 11, attempts: 15, streak: 1, bestStreak: 4 },
                digits: { level: 6, mastery: 4, correct: 16, attempts: 19, streak: 4, bestStreak: 6 },
                sentence: { level: 4, mastery: 2, correct: 10, attempts: 13, streak: 2, bestStreak: 3 }
              },
              history: []
            }),
            set: async () => {}
          },
          onChanged: { addListener: () => {} }
        },
        alarms: { get: async () => ({ scheduledTime: Date.now() + 17 * 60 * 1000 }) },
        runtime: { sendMessage: async () => ({ ok: true, delivered: true }) }
      };
    `,
  });
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await navigate(client, pathToFileURL(path.join(root, "dashboard.html")).href);
  const desktop = await evaluate(client, `({
    title: document.title,
    skillCards: document.querySelectorAll(".skill-card").length,
    selectedSkills: document.querySelectorAll("[data-skill]:checked").length,
    overflow: document.body.scrollWidth > innerWidth,
    h1: document.querySelector("h1")?.textContent
  })`);
  assert.equal(desktop.title, "Brainbreak — Dashboard");
  assert.equal(desktop.skillCards, 6);
  assert.equal(desktop.selectedSkills, 6);
  assert.equal(desktop.overflow, false);
  assert.equal(desktop.h1, "Keep your mind moving.");
  await screenshot(client, "dashboard-desktop.png");

  const selection = await evaluate(client, `(() => {
    document.querySelector("#select-all").click();
    const empty = document.querySelectorAll("[data-skill]:checked").length;
    document.querySelector("#select-all").click();
    return { empty, full: document.querySelectorAll("[data-skill]:checked").length };
  })()`);
  assert.deepEqual(selection, { empty: 0, full: 6 });

  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await client.send("Page.reload");
  await wait(700);
  const mobile = await evaluate(client, `({
    overflow: document.body.scrollWidth > innerWidth,
    columns: getComputedStyle(document.querySelector(".stats-grid")).gridTemplateColumns,
    mainWidth: document.querySelector("main").getBoundingClientRect().width
  })`);
  assert.equal(mobile.overflow, false);
  assert.equal(mobile.mainWidth, 390);
  assert.equal(mobile.columns.split(" ").length, 1);
  await screenshot(client, "dashboard-mobile.png");
  assert.equal(errors.length, 0, `dashboard console errors: ${errors.join("\\n")}`);
}

async function testLiveBlocker(client, errors) {
  await client.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      (() => {
        const nativeAttachShadow = Element.prototype.attachShadow;
        Element.prototype.attachShadow = function () {
          return nativeAttachShadow.call(this, { mode: "open" });
        };
        globalThis.__brainListener = null;
        globalThis.__completedMessage = null;
        globalThis.chrome = {
          runtime: {
            onMessage: { addListener: (listener) => { globalThis.__brainListener = listener; } },
            sendMessage: async (message) => {
              if (message.type === "COMPLETE_SESSION") globalThis.__completedMessage = message;
              return { ok: true };
            }
          }
        };
      })();
    `,
  });
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 820,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await navigate(client, "data:text/html,<title>Normal webpage</title><main><h1>Browsing page</h1></main>");
  await evaluate(client, fs.readFileSync(path.join(root, "trainer.js"), "utf8"));
  await evaluate(client, fs.readFileSync(path.join(root, "content.js"), "utf8"));
  const opened = await evaluate(client, `(() => {
    const skills = Object.fromEntries(Object.keys(BrainbreakTrainer.SKILLS).map((key) => [key, key === "addition"]));
    const settings = BrainbreakTrainer.normalizeSettings({ enabled: true, interval: 30, questionCount: 3, skills });
    const profiles = BrainbreakTrainer.normalizeProfiles();
    __brainListener({ type: "SHOW_SESSION", session: { id: "browser-smoke", scheduledAt: Date.now(), settings, profiles } });
    const root = document.querySelector("#brainbreak-root");
    return {
      hasRoot: Boolean(root),
      prompt: root?.shadowRoot.querySelector(".math-prompt")?.textContent,
      hiddenOverflow: document.documentElement.style.overflow
    };
  })()`);
  assert.equal(opened.hasRoot, true);
  assert.ok(opened.prompt);
  assert.equal(opened.hiddenOverflow, "hidden");
  await wait(520);
  await screenshot(client, "blocker-arithmetic.png");

  for (let index = 0; index < 3; index += 1) {
    const solved = await evaluate(client, `(() => {
      const root = document.querySelector("#brainbreak-root");
      const challenge = BrainbreakTrainer.createSessionPlan(
        BrainbreakTrainer.normalizeSettings({
          enabled: true,
          interval: 30,
          questionCount: 3,
          skills: Object.fromEntries(Object.keys(BrainbreakTrainer.SKILLS).map((key) => [key, key === "addition"]))
        }),
        BrainbreakTrainer.normalizeProfiles(),
        "browser-smoke"
      )[${index}];
      const form = root.shadowRoot.querySelector(".answer-form");
      form.elements.answer.value = challenge.answer;
      form.requestSubmit();
      return challenge.answer;
    })()`);
    assert.ok(solved);
    await wait(720);
  }

  const complete = await evaluate(client, `({
    heading: document.querySelector("#brainbreak-root")?.shadowRoot.querySelector(".complete-copy h1")?.textContent,
    resultCards: document.querySelectorAll("#brainbreak-root").length
  })`);
  assert.equal(complete.heading, "You earned your tab back.");
  await wait(480);
  await screenshot(client, "blocker-complete.png");
  await evaluate(client, `document.querySelector("#brainbreak-root").shadowRoot.querySelector(".finish-button").click()`);
  await wait(150);
  const saved = await evaluate(client, `({
    resultCount: __completedMessage?.results?.length,
    rootGone: !document.querySelector("#brainbreak-root"),
    overflowRestored: document.documentElement.style.overflow
  })`);
  assert.equal(saved.resultCount, 3);
  assert.equal(saved.rootGone, true);
  assert.equal(saved.overflowRestored, "");
  assert.equal(errors.length, 0, `blocker console errors: ${errors.join("\\n")}`);
}

async function testMemoryBlocker(client, errors) {
  await navigate(client, "data:text/html,<title>Memory test page</title><main><h1>Browsing page</h1></main>");
  await evaluate(client, fs.readFileSync(path.join(root, "trainer.js"), "utf8"));
  await evaluate(client, fs.readFileSync(path.join(root, "content.js"), "utf8"));
  const digitsOpened = await evaluate(client, `(() => {
    const skills = Object.fromEntries(Object.keys(BrainbreakTrainer.SKILLS).map((key) => [key, key === "digits"]));
    const settings = BrainbreakTrainer.normalizeSettings({ enabled: true, interval: 30, questionCount: 3, skills });
    const profiles = BrainbreakTrainer.normalizeProfiles({ digits: { level: 5 } });
    __brainListener({ type: "SHOW_SESSION", session: { id: "digits-smoke", scheduledAt: Date.now(), settings, profiles } });
    const root = document.querySelector("#brainbreak-root");
    return {
      value: root.shadowRoot.querySelector(".memory-value")?.textContent,
      detail: root.shadowRoot.querySelector(".memory-detail")?.textContent
    };
  })()`);
  assert.match(digitsOpened.value, /^\d{9}$/);
  assert.equal(digitsOpened.detail, "9 digits");
  await wait(520);
  await screenshot(client, "blocker-memory.png");

  const retry = await evaluate(client, `(() => {
    const root = document.querySelector("#brainbreak-root");
    root.shadowRoot.querySelector(".secondary-button").click();
    const form = root.shadowRoot.querySelector(".answer-form");
    form.elements.answer.value = "000";
    form.requestSubmit();
    return root.shadowRoot.querySelector(".instruction")?.textContent;
  })()`);
  assert.equal(retry, "Study it once more");

  await evaluate(client, `(() => {
    const root = document.querySelector("#brainbreak-root");
    root.shadowRoot.querySelector(".secondary-button").click();
    const challenge = BrainbreakTrainer.createSessionPlan(
      BrainbreakTrainer.normalizeSettings({
        enabled: true,
        interval: 30,
        questionCount: 3,
        skills: Object.fromEntries(Object.keys(BrainbreakTrainer.SKILLS).map((key) => [key, key === "digits"]))
      }),
      BrainbreakTrainer.normalizeProfiles({ digits: { level: 5 } }),
      "digits-smoke"
    )[0];
    const form = root.shadowRoot.querySelector(".answer-form");
    form.elements.answer.value = challenge.answer;
    form.requestSubmit();
  })()`);
  await wait(720);
  assert.equal(
    await evaluate(client, `document.querySelector("#brainbreak-root").shadowRoot.querySelector(".progress-label").textContent`),
    "2 of 3",
  );

  await navigate(client, "data:text/html,<title>Sentence test page</title><main><h1>Browsing page</h1></main>");
  await evaluate(client, fs.readFileSync(path.join(root, "trainer.js"), "utf8"));
  await evaluate(client, fs.readFileSync(path.join(root, "content.js"), "utf8"));
  const sentenceAccepted = await evaluate(client, `(async () => {
    const skills = Object.fromEntries(Object.keys(BrainbreakTrainer.SKILLS).map((key) => [key, key === "sentence"]));
    const settings = BrainbreakTrainer.normalizeSettings({ enabled: true, interval: 30, questionCount: 3, skills });
    const profiles = BrainbreakTrainer.normalizeProfiles({ sentence: { level: 6 } });
    __brainListener({ type: "SHOW_SESSION", session: { id: "sentence-smoke", scheduledAt: Date.now(), settings, profiles } });
    const root = document.querySelector("#brainbreak-root");
    root.shadowRoot.querySelector(".secondary-button").click();
    const challenge = BrainbreakTrainer.createSessionPlan(settings, profiles, "sentence-smoke")[0];
    const form = root.shadowRoot.querySelector(".answer-form");
    const usedTextarea = form.elements.answer.tagName === "TEXTAREA";
    form.elements.answer.value = challenge.answer.toUpperCase().replace(/[,.']/g, "");
    form.requestSubmit();
    await new Promise((resolve) => setTimeout(resolve, 700));
    return {
      usedTextarea,
      progress: root.shadowRoot.querySelector(".progress-label").textContent
    };
  })()`);
  assert.equal(sentenceAccepted.usedTextarea, true);
  assert.equal(sentenceAccepted.progress, "2 of 3");
  assert.equal(errors.length, 0, `memory blocker console errors: ${errors.join("\\n")}`);
}

(async () => {
  const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
  const page = targets.find((target) => target.type === "page");
  assert.ok(page, "Chrome page target not found");
  const client = new CdpClient(page.webSocketDebuggerUrl);
  await client.connect();
  const errors = [];
  client.on("Runtime.exceptionThrown", (event) => {
    errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text);
  });
  await client.send("Page.enable");
  await client.send("Runtime.enable");

  await testDashboard(client, errors);
  errors.length = 0;
  await testLiveBlocker(client, errors);
  errors.length = 0;
  await testMemoryBlocker(client, errors);
  client.close();
  console.log("Brainbreak browser smoke tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
