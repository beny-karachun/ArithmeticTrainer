importScripts("trainer.js");

const ALARM_NAME = "brainbreak:training";
const Trainer = globalThis.BrainbreakTrainer;
const getLocal = (keys) => chrome.storage.local.get(keys);
const setLocal = (value) => chrome.storage.local.set(value);

let storageMutationQueue = Promise.resolve();

function serializeStorageMutation(operation) {
  const result = storageMutationQueue.then(operation, operation);
  storageMutationQueue = result.catch(() => {});
  return result;
}

async function initialize() {
  const data = await getLocal(["settings", "profiles", "history", "pendingSessions"]);
  const settings = Trainer.normalizeSettings(data.settings);
  const profiles = Trainer.normalizeProfiles(data.profiles);
  const history = Array.isArray(data.history) ? data.history : [];
  const pendingSessions = Array.isArray(data.pendingSessions) ? data.pendingSessions : [];
  await setLocal({ settings, profiles, history, pendingSessions });
  await syncAlarm(settings);
}

async function syncAlarm(providedSettings) {
  const settings = Trainer.normalizeSettings(
    providedSettings || (await getLocal("settings")).settings,
  );
  const existing = await chrome.alarms.get(ALARM_NAME);
  if (!settings.enabled) {
    if (existing) await chrome.alarms.clear(ALARM_NAME);
    return;
  }

  const interval = Math.max(1, settings.interval);
  if (!existing || existing.periodInMinutes !== interval) {
    await chrome.alarms.clear(ALARM_NAME);
    chrome.alarms.create(ALARM_NAME, {
      delayInMinutes: interval,
      periodInMinutes: interval,
    });
  }
}

async function queueSession(scheduledAt = Date.now(), manual = false) {
  const queued = await serializeStorageMutation(async () => {
    const data = await getLocal(["settings", "pendingSessions"]);
    const settings = Trainer.normalizeSettings(data.settings);
    const pendingSessions = Array.isArray(data.pendingSessions) ? data.pendingSessions : [];
    if (!manual && !settings.enabled) return false;
    if (!pendingSessions.length) {
      pendingSessions.push({
        id: crypto.randomUUID(),
        scheduledAt,
        manual,
      });
      await setLocal({ pendingSessions });
    }
    return true;
  });

  if (queued) await deliverNextSession();
  return queued;
}

function canHostSession(tab) {
  return /^(https?|file):/.test(tab?.url || "");
}

async function sendSessionToTab(tab, session) {
  if (!tab?.id || !canHostSession(tab)) return false;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "SHOW_SESSION", session });
    return true;
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["trainer.js", "content.js"],
      });
      await chrome.tabs.sendMessage(tab.id, { type: "SHOW_SESSION", session });
      return true;
    } catch {
      return false;
    }
  }
}

async function deliverNextSession(tabId) {
  const data = await getLocal(["pendingSessions", "settings", "profiles"]);
  const pendingSessions = Array.isArray(data.pendingSessions) ? data.pendingSessions : [];
  if (!pendingSessions.length) {
    await chrome.action.setBadgeText({ text: "" });
    return false;
  }

  const session = {
    ...pendingSessions[0],
    settings: Trainer.normalizeSettings(data.settings),
    profiles: Trainer.normalizeProfiles(data.profiles),
  };
  const tabs = tabId
    ? [await chrome.tabs.get(tabId).catch(() => null)].filter(Boolean)
    : await chrome.tabs.query({});
  const results = await Promise.all(tabs.map((tab) => sendSessionToTab(tab, session)));
  const delivered = results.some(Boolean);

  if (delivered) {
    await chrome.action.setBadgeText({ text: "" });
  } else {
    await chrome.action.setBadgeBackgroundColor({ color: "#d9ff43" });
    await chrome.action.setBadgeTextColor({ color: "#111512" }).catch(() => {});
    await chrome.action.setBadgeText({ text: String(Math.min(99, pendingSessions.length)) });
  }
  return delivered;
}

async function dismissSessionEverywhere(sessionId) {
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(
    tabs
      .filter((tab) => tab.id)
      .map((tab) => chrome.tabs.sendMessage(tab.id, {
        type: "DISMISS_SESSION",
        sessionId,
      })),
  );
}

function sanitizeResults(results) {
  if (!Array.isArray(results)) return [];
  return results.slice(0, 20).flatMap((result) => {
    if (!Trainer.SKILLS[result?.skill]) return [];
    return [{
      skill: result.skill,
      attempts: Math.min(99, Math.max(1, Math.round(Number(result.attempts) || 1))),
      elapsedMs: Math.min(3600000, Math.max(0, Math.round(Number(result.elapsedMs) || 0))),
      targetMs: Math.min(120000, Math.max(3000, Math.round(Number(result.targetMs) || 20000))),
      level: Math.min(12, Math.max(1, Math.round(Number(result.level) || 1))),
    }];
  });
}

chrome.runtime.onInstalled.addListener(({ reason }) => {
  initialize();
  if (reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
  }
});

chrome.runtime.onStartup.addListener(initialize);

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) queueSession(alarm.scheduledTime || Date.now());
});

chrome.tabs.onActivated.addListener(({ tabId }) => deliverNextSession(tabId));

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "complete") deliverNextSession(tabId);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.settings) {
    syncAlarm(changes.settings.newValue);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "CONTENT_READY") {
    deliverNextSession(sender.tab?.id);
    return;
  }

  if (message.type === "TRIGGER_SESSION") {
    queueSession(Date.now(), true).then(async (queued) => {
      const delivered = queued ? await deliverNextSession() : false;
      sendResponse({ ok: queued, delivered });
    });
    return true;
  }

  if (message.type === "COMPLETE_SESSION") {
    (async () => {
      const response = await serializeStorageMutation(async () => {
        const data = await getLocal(["pendingSessions", "profiles", "history"]);
        const pendingSessions = Array.isArray(data.pendingSessions) ? data.pendingSessions : [];
        const session = pendingSessions.find((item) => item.id === message.sessionId);
        if (!session) return { ok: false };

        const results = sanitizeResults(message.results);
        if (!results.length) return { ok: false };
        const completedAt = Date.now();
        const update = Trainer.applyResults(data.profiles, results, completedAt);
        const history = Array.isArray(data.history) ? data.history : [];
        const totalAttempts = results.reduce((sum, item) => sum + item.attempts, 0);
        const averageResponseMs = Math.round(
          results.reduce((sum, item) => sum + item.elapsedMs, 0) / results.length,
        );
        history.push({
          id: crypto.randomUUID(),
          scheduledAt: session.scheduledAt,
          completedAt,
          manual: Boolean(session.manual),
          challengeCount: results.length,
          totalAttempts,
          accuracy: Math.round((results.length / totalAttempts) * 100),
          averageResponseMs,
          skills: [...new Set(results.map((item) => item.skill))],
          promotions: update.promotions,
          results,
        });

        await setLocal({
          profiles: update.profiles,
          history: history.slice(-1000),
          pendingSessions: pendingSessions.filter((item) => item.id !== message.sessionId),
        });
        return {
          ok: true,
          promotions: update.promotions,
          demotions: update.demotions,
        };
      });

      sendResponse(response);
      if (!response.ok) return;
      await dismissSessionEverywhere(message.sessionId);
      setTimeout(() => deliverNextSession(), 500);
    })();
    return true;
  }
});

initialize();
