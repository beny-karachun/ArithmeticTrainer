(() => {
  if (window.top !== window || window.__brainbreakContentLoaded) return;
  window.__brainbreakContentLoaded = true;

  const Trainer = globalThis.BrainbreakTrainer;
  let activeSession = null;
  let host = null;
  let shadow = null;
  let plan = [];
  let results = [];
  let currentIndex = 0;
  let challengeAttempts = 0;
  let challengeStartedAt = 0;
  let memoryInterval = null;
  let memoryTimeout = null;
  let previousOverflow = null;

  function clearMemoryTimers() {
    if (memoryInterval) clearInterval(memoryInterval);
    if (memoryTimeout) clearTimeout(memoryTimeout);
    memoryInterval = null;
    memoryTimeout = null;
  }

  function closeSession(sessionId) {
    if (!activeSession || (sessionId && activeSession.id !== sessionId)) return;
    clearMemoryTimers();
    host?.remove();
    if (previousOverflow) {
      document.documentElement.style.setProperty(
        "overflow",
        previousOverflow.value,
        previousOverflow.priority,
      );
    } else {
      document.documentElement.style.removeProperty("overflow");
    }
    activeSession = null;
    host = null;
    shadow = null;
    plan = [];
    results = [];
    currentIndex = 0;
  }

  function makeProgressDots() {
    return plan.map((_, index) => {
      const className = index < currentIndex ? "done" : index === currentIndex ? "current" : "";
      return `<i class="${className}" aria-hidden="true"></i>`;
    }).join("");
  }

  function updateChrome() {
    const progress = Math.round((currentIndex / plan.length) * 100);
    shadow.querySelector(".progress-dots").innerHTML = makeProgressDots();
    shadow.querySelector(".progress-label").textContent = `${Math.min(currentIndex + 1, plan.length)} of ${plan.length}`;
    shadow.querySelector(".progress-fill").style.width = `${progress}%`;
  }

  function renderArithmetic(challenge) {
    challengeAttempts = 0;
    challengeStartedAt = Date.now();
    const stage = shadow.querySelector(".stage");
    stage.innerHTML = `
      <div class="stage-head enter-one">
        <span class="skill-chip"></span>
        <span class="level-label">Level ${challenge.level}</span>
      </div>
      <div class="prompt-wrap enter-two">
        <p class="instruction">Solve this</p>
        <h1 class="math-prompt"></h1>
      </div>
      <form class="answer-form enter-three" novalidate>
        <label for="brainbreak-answer">Your answer</label>
        <div class="answer-row">
          <input id="brainbreak-answer" name="answer" inputmode="numeric" autocomplete="off" spellcheck="false" required>
          <button class="submit-button" type="submit">Check answer <span aria-hidden="true">→</span></button>
        </div>
        <p class="feedback" role="status" aria-live="polite"></p>
      </form>`;

    const skill = Trainer.SKILLS[challenge.skill];
    const chip = stage.querySelector(".skill-chip");
    chip.textContent = `${skill.symbol} ${skill.label}`;
    chip.style.setProperty("--skill-color", skill.color);
    stage.querySelector(".math-prompt").textContent = challenge.prompt;
    const form = stage.querySelector("form");
    const input = stage.querySelector("input");
    form.addEventListener("submit", (event) => submitAnswer(event, challenge));
    setTimeout(() => input.focus(), 80);
  }

  function renderMemory(challenge) {
    challengeAttempts = 0;
    challengeStartedAt = 0;
    showMemory(challenge, challenge.displaySeconds, false);
  }

  function showMemory(challenge, seconds, retry) {
    clearMemoryTimers();
    const stage = shadow.querySelector(".stage");
    stage.innerHTML = `
      <div class="stage-head enter-one">
        <span class="skill-chip"></span>
        <span class="level-label">Level ${challenge.level}</span>
      </div>
      <div class="memory-wrap enter-two">
        <div class="memory-meta">
          <div><p class="instruction">${retry ? "Study it once more" : "Memorize this"}</p><p class="memory-detail"></p></div>
          <div class="memory-clock"><span>Hiding in</span><strong>0.0</strong></div>
        </div>
        <div class="memory-card"><p class="memory-value"></p></div>
      </div>
      <div class="memory-actions enter-three">
        <p>No need to rush. Build a clear mental picture.</p>
        <button class="secondary-button" type="button">I’m ready to recall <span aria-hidden="true">→</span></button>
      </div>`;

    const skill = Trainer.SKILLS[challenge.skill];
    const chip = stage.querySelector(".skill-chip");
    chip.textContent = `${skill.symbol} ${skill.label}`;
    chip.style.setProperty("--skill-color", skill.color);
    stage.querySelector(".memory-detail").textContent = challenge.memoryType === "digits"
      ? `${challenge.length} digits`
      : `${challenge.wordCount} words`;
    const value = stage.querySelector(".memory-value");
    value.textContent = challenge.prompt;
    value.classList.toggle("digits", challenge.memoryType === "digits");
    const button = stage.querySelector("button");
    button.addEventListener("click", () => showRecall(challenge));

    const duration = Math.max(2, seconds) * 1000;
    const endsAt = Date.now() + duration;
    const clock = stage.querySelector(".memory-clock strong");
    const updateClock = () => {
      clock.textContent = `${Math.max(0, (endsAt - Date.now()) / 1000).toFixed(1)}s`;
    };
    updateClock();
    memoryInterval = setInterval(updateClock, 100);
    memoryTimeout = setTimeout(() => showRecall(challenge), duration);
  }

  function showRecall(challenge) {
    clearMemoryTimers();
    if (!challengeStartedAt) challengeStartedAt = Date.now();
    const stage = shadow.querySelector(".stage");
    const isSentence = challenge.memoryType === "sentence";
    stage.innerHTML = `
      <div class="stage-head">
        <span class="skill-chip"></span>
        <span class="level-label">Level ${challenge.level}</span>
      </div>
      <div class="prompt-wrap recall-prompt">
        <p class="instruction">Now recall it</p>
        <h1>${isSentence ? "Type the sentence from memory." : "Type every digit in order."}</h1>
        <p class="recall-hint">${isSentence ? "Capitalization and punctuation do not matter." : "Spaces are fine—we only check the digits."}</p>
      </div>
      <form class="answer-form" novalidate>
        <label for="brainbreak-answer">${isSentence ? "Your sentence" : "Your number"}</label>
        <div class="answer-row ${isSentence ? "sentence-row" : ""}">
          ${isSentence
            ? `<textarea id="brainbreak-answer" name="answer" rows="3" autocomplete="off" spellcheck="true" required></textarea>`
            : `<input id="brainbreak-answer" name="answer" inputmode="numeric" autocomplete="off" spellcheck="false" required>`}
          <button class="submit-button" type="submit">Check recall <span aria-hidden="true">→</span></button>
        </div>
        <p class="feedback" role="status" aria-live="polite"></p>
      </form>`;

    const skill = Trainer.SKILLS[challenge.skill];
    const chip = stage.querySelector(".skill-chip");
    chip.textContent = `${skill.symbol} ${skill.label}`;
    chip.style.setProperty("--skill-color", skill.color);
    stage.querySelector("form").addEventListener("submit", (event) => submitAnswer(event, challenge));
    setTimeout(() => stage.querySelector("[name=answer]").focus(), 60);
  }

  function showWrongArithmetic(form) {
    const input = form.elements.answer;
    const feedback = form.querySelector(".feedback");
    feedback.textContent = "Not quite. Check the operation and try again.";
    feedback.className = "feedback wrong";
    input.classList.remove("invalid");
    void input.offsetWidth;
    input.classList.add("invalid");
    input.select();
  }

  function submitAnswer(event, challenge) {
    event.preventDefault();
    const form = event.currentTarget;
    const value = form.elements.answer.value;
    if (!String(value).trim()) {
      form.elements.answer.focus();
      return;
    }

    challengeAttempts += 1;
    if (!Trainer.isAnswerCorrect(challenge, value)) {
      if (challenge.type === "memory") {
        showMemory(challenge, 3, true);
      } else {
        showWrongArithmetic(form);
      }
      return;
    }

    const elapsedMs = Math.max(1, Date.now() - challengeStartedAt);
    results.push({
      skill: challenge.skill,
      attempts: challengeAttempts,
      elapsedMs,
      targetMs: challenge.targetMs,
      level: challenge.level,
    });

    const feedback = form.querySelector(".feedback");
    feedback.textContent = challengeAttempts === 1 ? "Correct. Nice and clean." : "Correct. Locked in.";
    feedback.className = "feedback correct";
    form.elements.answer.disabled = true;
    form.querySelector("button").disabled = true;
    currentIndex += 1;
    updateChrome();

    setTimeout(() => {
      if (!activeSession) return;
      if (currentIndex >= plan.length) {
        renderComplete();
      } else {
        renderChallenge();
      }
    }, 620);
  }

  function renderChallenge() {
    clearMemoryTimers();
    updateChrome();
    const challenge = plan[currentIndex];
    if (challenge.type === "arithmetic") {
      renderArithmetic(challenge);
    } else {
      renderMemory(challenge);
    }
  }

  function renderComplete() {
    const attempts = results.reduce((sum, item) => sum + item.attempts, 0);
    const accuracy = Math.round((results.length / attempts) * 100);
    const averageSeconds = results.reduce((sum, item) => sum + item.elapsedMs, 0) / results.length / 1000;
    const preview = Trainer.applyResults(activeSession.profiles, results);
    const stage = shadow.querySelector(".stage");
    shadow.querySelector(".progress-label").textContent = "Complete";
    shadow.querySelector(".progress-fill").style.width = "100%";
    shadow.querySelector(".progress-dots").innerHTML = plan.map(() => '<i class="done" aria-hidden="true"></i>').join("");
    stage.innerHTML = `
      <div class="complete-mark enter-one" aria-hidden="true">✓</div>
      <div class="complete-copy enter-two">
        <p class="instruction">Brainbreak complete</p>
        <h1>You earned your tab back.</h1>
        <p>Small, focused repetitions compound. Your next set will adapt to how this one went.</p>
      </div>
      <div class="result-grid enter-three">
        <div><span>Accuracy</span><strong>${accuracy}%</strong></div>
        <div><span>Avg. response</span><strong>${averageSeconds.toFixed(1)}s</strong></div>
        <div><span>Level ups</span><strong>${preview.promotions.length}</strong></div>
      </div>
      <button class="finish-button enter-four" type="button">Continue browsing <span aria-hidden="true">→</span></button>
      <p class="save-status" role="status" aria-live="polite"></p>`;

    stage.querySelector(".finish-button").addEventListener("click", completeSession);
    setTimeout(() => stage.querySelector(".finish-button").focus(), 100);
  }

  async function completeSession() {
    const button = shadow.querySelector(".finish-button");
    const status = shadow.querySelector(".save-status");
    button.disabled = true;
    button.textContent = "Saving progress…";
    try {
      const response = await chrome.runtime.sendMessage({
        type: "COMPLETE_SESSION",
        sessionId: activeSession.id,
        results,
      });
      if (response?.ok) {
        closeSession(activeSession?.id);
        return;
      }
      throw new Error("Session was not saved");
    } catch {
      if (!shadow) return;
      button.disabled = false;
      button.textContent = "Try again";
      status.textContent = "Chrome could not save this set yet. Your answers are still here.";
    }
  }

  function renderSession(session) {
    if (activeSession || !document.documentElement || !Trainer) return;
    activeSession = session;
    plan = Trainer.createSessionPlan(session.settings, session.profiles, session.id);
    if (!plan.length) {
      activeSession = null;
      return;
    }

    previousOverflow = {
      value: document.documentElement.style.getPropertyValue("overflow"),
      priority: document.documentElement.style.getPropertyPriority("overflow"),
    };
    host = document.createElement("div");
    host.id = "brainbreak-root";
    shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML = `
      <style>
        :host{all:initial;position:fixed;inset:0;z-index:2147483647;color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
        *{box-sizing:border-box}
        button,input,textarea{font:inherit}
        button{min-height:44px}
        .veil{position:absolute;inset:0;display:grid;place-items:center;overflow:auto;padding:26px;background:#0a0d0b;color:#f5f7ed}
        .ambient{position:fixed;inset:0;overflow:hidden;pointer-events:none}
        .ambient:before,.ambient:after{content:"";position:absolute;width:520px;height:520px;border-radius:50%;filter:blur(105px);opacity:.17}
        .ambient:before{top:-240px;left:-160px;background:#d9ff43}.ambient:after{right:-180px;bottom:-280px;background:#785fff}
        .grain{position:fixed;inset:0;opacity:.035;pointer-events:none;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.95' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.8'/%3E%3C/svg%3E")}
        .shell{position:relative;width:min(820px,100%);min-height:620px;padding:18px;border-radius:38px;background:rgba(27,32,28,.78);box-shadow:0 0 0 1px rgba(255,255,255,.08),0 34px 100px rgba(0,0,0,.58);backdrop-filter:blur(26px);animation:shell-in .38s cubic-bezier(.2,0,0,1)}
        .inner{display:flex;min-height:584px;flex-direction:column;border-radius:22px;background:#111512;box-shadow:inset 0 1px rgba(255,255,255,.045)}
        .topbar{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:18px;padding:22px 25px;border-bottom:1px solid rgba(255,255,255,.07)}
        .brand{display:flex;align-items:center;gap:10px;font-size:13px;font-weight:850;letter-spacing:-.02em}
        .brand-mark{display:grid;width:32px;height:32px;place-items:center;border-radius:10px;background:#d9ff43;color:#111512;font-size:15px;font-weight:950;box-shadow:0 7px 20px rgba(217,255,67,.15)}
        .progress-dots{display:flex;align-items:center;justify-content:center;gap:6px}
        .progress-dots i{width:7px;height:7px;border-radius:99px;background:#333a34;transition-property:width,background-color;transition-duration:180ms;transition-timing-function:cubic-bezier(.2,0,0,1)}
        .progress-dots i.current{width:23px;background:#d9ff43}.progress-dots i.done{background:#6d7a6f}
        .progress-label{justify-self:end;color:#8f998f;font-size:12px;font-weight:750;font-variant-numeric:tabular-nums}
        .progress-track{height:2px;background:#252b26}.progress-fill{width:0;height:100%;background:#d9ff43;transition-property:width;transition-duration:250ms;transition-timing-function:cubic-bezier(.2,0,0,1)}
        .stage{display:flex;min-height:510px;flex:1;flex-direction:column;padding:44px 52px 38px}
        .stage-head{display:flex;align-items:center;justify-content:space-between;gap:16px}
        .skill-chip{display:inline-flex;min-height:34px;align-items:center;padding:0 12px;border-radius:10px;background:color-mix(in srgb,var(--skill-color) 13%,transparent);color:var(--skill-color);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--skill-color) 20%,transparent);font-size:11px;font-weight:850;letter-spacing:.035em;text-transform:uppercase}
        .level-label{color:#778078;font-size:11px;font-weight:750;font-variant-numeric:tabular-nums}
        .prompt-wrap{display:grid;min-height:265px;place-content:center;text-align:center}
        .instruction{margin:0 0 14px;color:#89938a;font-size:12px;font-weight:800;letter-spacing:.13em;text-transform:uppercase}
        h1{margin:0;text-wrap:balance}
        .math-prompt{font-size:clamp(58px,10vw,96px);font-weight:780;line-height:1;letter-spacing:-.07em;font-variant-numeric:tabular-nums}
        .answer-form{margin-top:auto}
        .answer-form label{display:block;margin:0 0 9px;color:#a6afa7;font-size:12px;font-weight:750}
        .answer-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px}
        input,textarea{width:100%;border:0;border-radius:15px;outline:0;background:#1c221d;color:#f7f8f1;box-shadow:inset 0 0 0 1px rgba(255,255,255,.09);font-weight:720;transition-property:box-shadow,background-color;transition-duration:160ms;transition-timing-function:ease-out}
        input{height:58px;padding:0 18px;font-size:24px;font-variant-numeric:tabular-nums}
        textarea{min-height:96px;padding:14px 17px;resize:none;font-size:16px;line-height:1.45}
        input:focus,textarea:focus{background:#202720;box-shadow:inset 0 0 0 2px #d9ff43,0 0 0 4px rgba(217,255,67,.08)}
        input.invalid,textarea.invalid{animation:shake .24s ease-out;box-shadow:inset 0 0 0 2px #ff7d61}
        button{border:0;border-radius:15px;cursor:pointer;font-weight:820;transition-property:scale,background-color,color,box-shadow;transition-duration:150ms;transition-timing-function:ease-out}
        button:active:not(:disabled){scale:.96}button:disabled{cursor:wait;opacity:.55}
        .submit-button,.finish-button{min-width:190px;padding:0 20px;background:#d9ff43;color:#111512;box-shadow:0 10px 30px rgba(217,255,67,.12)}
        .submit-button:hover,.finish-button:hover{background:#e4ff76;box-shadow:0 13px 34px rgba(217,255,67,.18)}
        .feedback{min-height:21px;margin:10px 2px 0;font-size:12px;font-weight:700}.feedback.wrong{color:#ff8a70}.feedback.correct{color:#d9ff43}
        .memory-wrap{display:flex;flex:1;flex-direction:column;margin-top:34px}
        .memory-meta{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:13px}
        .memory-meta .instruction{margin-bottom:4px}.memory-detail{margin:0;color:#667168;font-size:11px;font-weight:700}
        .memory-clock{text-align:right}.memory-clock span,.memory-clock strong{display:block}.memory-clock span{color:#697269;font-size:9px;font-weight:800;letter-spacing:.09em;text-transform:uppercase}.memory-clock strong{margin-top:3px;color:#d9ff43;font-size:17px;font-variant-numeric:tabular-nums}
        .memory-card{display:grid;min-height:250px;flex:1;place-items:center;padding:34px;border-radius:22px;background:#1a201b;box-shadow:inset 0 0 0 1px rgba(255,255,255,.065),0 18px 50px rgba(0,0,0,.18)}
        .memory-value{max-width:660px;margin:0;color:#f5f7ef;font-size:clamp(25px,4vw,39px);font-weight:650;line-height:1.28;letter-spacing:-.035em;text-align:center;text-wrap:balance}
        .memory-value.digits{font-size:clamp(38px,7vw,68px);font-weight:780;letter-spacing:.08em;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
        .memory-actions{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-top:18px}.memory-actions p{margin:0;color:#6e786f;font-size:11px;text-wrap:pretty}
        .secondary-button{padding:0 16px;background:#252c26;color:#edf0e8;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}.secondary-button:hover{background:#303832}
        .recall-prompt{min-height:220px;place-content:center start;text-align:left}.recall-prompt h1{max-width:590px;font-size:clamp(34px,5vw,52px);line-height:1.03;letter-spacing:-.055em}.recall-hint{margin:14px 0 0;color:#788179;font-size:13px;text-wrap:pretty}
        .sentence-row{grid-template-columns:minmax(0,1fr) 190px;align-items:stretch}.sentence-row .submit-button{min-height:96px}
        .complete-mark{display:grid;width:72px;height:72px;place-items:center;margin:auto auto 24px;border-radius:22px;background:#d9ff43;color:#111512;box-shadow:0 18px 50px rgba(217,255,67,.18);font-size:34px;font-weight:950}
        .complete-copy{text-align:center}.complete-copy h1{font-size:clamp(39px,6vw,62px);line-height:1;letter-spacing:-.06em}.complete-copy>p:last-child{max-width:520px;margin:18px auto 0;color:#8e988f;font-size:14px;line-height:1.55;text-wrap:pretty}
        .result-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin:31px 0 16px}.result-grid div{padding:16px;border-radius:15px;background:#1a201b;text-align:center;box-shadow:inset 0 0 0 1px rgba(255,255,255,.055)}.result-grid span,.result-grid strong{display:block}.result-grid span{color:#778078;font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.result-grid strong{margin-top:7px;font-size:24px;font-variant-numeric:tabular-nums}
        .finish-button{width:100%;min-height:58px}.save-status{min-height:18px;margin:9px 0 -9px;color:#ff8a70;text-align:center;font-size:11px}
        .enter-one,.enter-two,.enter-three,.enter-four{opacity:0;filter:blur(4px);transform:translateY(10px);animation:enter .34s cubic-bezier(.2,0,0,1) forwards}.enter-two{animation-delay:70ms}.enter-three{animation-delay:140ms}.enter-four{animation-delay:210ms}
        @keyframes shell-in{from{opacity:0;transform:translateY(14px) scale(.985)}to{opacity:1;transform:none}}
        @keyframes enter{to{opacity:1;filter:blur(0);transform:none}}
        @keyframes shake{25%{transform:translateX(-5px)}50%{transform:translateX(4px)}75%{transform:translateX(-2px)}}
        @media(max-width:650px){.veil{padding:10px}.shell{min-height:calc(100vh - 20px);padding:8px;border-radius:27px}.inner{min-height:calc(100vh - 36px);border-radius:19px}.topbar{grid-template-columns:1fr auto;padding:17px}.progress-dots{display:none}.stage{min-height:0;padding:30px 22px 24px}.answer-row,.sentence-row{grid-template-columns:1fr}.submit-button{min-height:54px}.memory-card{min-height:210px;padding:23px}.memory-actions{align-items:stretch;flex-direction:column}.memory-actions .secondary-button{width:100%}.result-grid{gap:6px}.result-grid div{padding:13px 8px}}
        @media(prefers-reduced-motion:reduce){*,*:before,*:after{animation-duration:.01ms!important;animation-delay:0ms!important;transition-duration:.01ms!important}}
      </style>
      <div class="veil" role="dialog" aria-modal="true" aria-label="Brainbreak training session">
        <div class="ambient"></div><div class="grain"></div>
        <section class="shell">
          <div class="inner">
            <header class="topbar">
              <div class="brand"><span class="brand-mark">B</span><span>brainbreak</span></div>
              <div class="progress-dots" aria-hidden="true"></div>
              <span class="progress-label"></span>
            </header>
            <div class="progress-track"><div class="progress-fill"></div></div>
            <main class="stage"></main>
          </div>
        </section>
      </div>`;

    document.documentElement.appendChild(host);
    document.documentElement.style.setProperty("overflow", "hidden", "important");
    renderChallenge();
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "SHOW_SESSION") renderSession(message.session);
    if (message.type === "DISMISS_SESSION") closeSession(message.sessionId);
  });

  chrome.runtime.sendMessage({ type: "CONTENT_READY" }).catch(() => {});
})();
