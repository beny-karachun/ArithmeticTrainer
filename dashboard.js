const Trainer = globalThis.BrainbreakTrainer;
const state = {
  settings: Trainer.normalizeSettings(),
  profiles: Trainer.normalizeProfiles(),
  history: [],
  nextAlarmTime: null,
};
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
let toastTimer = null;

document.addEventListener("DOMContentLoaded", async () => {
  const data = await chrome.storage.local.get(["settings", "profiles", "history"]);
  state.settings = Trainer.normalizeSettings(data.settings);
  state.profiles = Trainer.normalizeProfiles(data.profiles);
  state.history = Array.isArray(data.history) ? data.history : [];
  bindEvents();
  setSkillColors();
  render();
  await refreshAlarm();
  setInterval(renderCountdown, 1000);
  setInterval(refreshAlarm, 15000);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.settings) state.settings = Trainer.normalizeSettings(changes.settings.newValue);
  if (changes.profiles) state.profiles = Trainer.normalizeProfiles(changes.profiles.newValue);
  if (changes.history) state.history = changes.history.newValue || [];
  render();
  setTimeout(refreshAlarm, 120);
});

function bindEvents() {
  $("#date-label").textContent = new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());

  $("#routine-form").addEventListener("submit", saveRoutine);
  $("#pause-routine").addEventListener("click", toggleRoutine);
  $("#train-now").addEventListener("click", trainNow);
  $("#select-all").addEventListener("click", selectAllSkills);
  $$("[data-skill]").forEach((input) => input.addEventListener("change", updateRoutineSummary));
  $$("[name=questionCount], [name=interval]").forEach((input) => {
    input.addEventListener("input", updateRoutineSummary);
  });

  $$(".nav-item").forEach((link) => link.addEventListener("click", () => {
    $$(".nav-item").forEach((item) => item.classList.toggle("active", item === link));
  }));
}

function setSkillColors() {
  $$("[data-option]").forEach((option) => {
    option.style.setProperty("--option-color", Trainer.SKILLS[option.dataset.option].color);
  });
}

function render() {
  renderRoutineState();
  renderStats();
  renderSkills();
  renderHistory();
  syncRoutineForm();
  renderCountdown();
}

function renderRoutineState() {
  const enabled = state.settings.enabled;
  $("#pause-routine").classList.toggle("paused", !enabled);
  $("#pause-label").textContent = enabled ? "Pause routine" : "Resume routine";
  $(".sidebar-status").classList.toggle("paused", !enabled);
  $("#sidebar-status-title").textContent = enabled ? "Routine active" : "Routine paused";
  $("#sidebar-status-copy").textContent = enabled
    ? "Only while Chrome is open"
    : "Practice sets still work";
}

function startOfDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function localDateKey(timestamp) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function calculateStreak() {
  const days = new Set(state.history.map((item) => localDateKey(item.completedAt)));
  let cursor = new Date();
  if (!days.has(localDateKey(cursor))) cursor = new Date(Date.now() - 86400000);
  let streak = 0;
  while (days.has(localDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function renderStats() {
  const today = state.history.filter((item) => item.completedAt >= startOfDay());
  const challengeCount = today.reduce((sum, item) => sum + (item.challengeCount || 0), 0);
  const attempts = today.reduce((sum, item) => sum + (item.totalAttempts || 0), 0);
  const weightedResponse = today.reduce(
    (sum, item) => sum + ((item.averageResponseMs || 0) * (item.challengeCount || 0)),
    0,
  );
  $("#today-sessions").textContent = today.length;
  $("#today-accuracy").textContent = attempts ? `${Math.round((challengeCount / attempts) * 100)}%` : "—";
  $("#today-response").textContent = challengeCount
    ? `${(weightedResponse / challengeCount / 1000).toFixed(1)}s`
    : "—";
  $("#daily-streak").textContent = calculateStreak();
}

function renderSkills() {
  const profiles = state.profiles;
  const averageLevel = Object.values(profiles).reduce((sum, profile) => sum + profile.level, 0)
    / Object.keys(profiles).length;
  $("#level-summary").textContent = `6 skills · Level ${averageLevel.toFixed(1)} average`;
  $("#skill-grid").innerHTML = Object.entries(Trainer.SKILLS).map(([key, skill]) => {
    const profile = profiles[key];
    const accuracy = profile.attempts ? Math.round((profile.correct / profile.attempts) * 100) : null;
    const mastery = Math.max(0, profile.mastery);
    return `
      <article class="skill-card" data-profile="${key}">
        <div class="skill-top">
          <span class="skill-icon">${skill.symbol}</span>
          <span class="skill-level">LEVEL ${profile.level}</span>
        </div>
        <h3>${skill.label}</h3>
        <span class="skill-meta">${profile.correct ? `${accuracy}% accuracy · ${profile.bestStreak} best streak` : "Ready for a baseline"}</span>
        <div class="mastery-row"><span>Mastery to next level</span><strong>${mastery}/6</strong></div>
        <div class="mastery-track"><i></i></div>
      </article>`;
  }).join("");

  $$("[data-profile]").forEach((card) => {
    const key = card.dataset.profile;
    const profile = profiles[key];
    card.style.setProperty("--skill-color", Trainer.SKILLS[key].color);
    card.style.setProperty("--mastery-width", `${Math.max(0, profile.mastery) / 6 * 100}%`);
  });
}

function syncRoutineForm() {
  const form = $("#routine-form");
  if (document.activeElement?.closest("#routine-form")) return;
  form.elements.interval.value = state.settings.interval;
  form.elements.questionCount.value = state.settings.questionCount;
  $$("[data-skill]").forEach((input) => {
    input.checked = state.settings.skills[input.dataset.skill];
  });
  updateRoutineSummary();
}

function getFormSettings() {
  const form = $("#routine-form");
  const skills = {};
  $$("[data-skill]").forEach((input) => {
    skills[input.dataset.skill] = input.checked;
  });
  return Trainer.normalizeSettings({
    enabled: state.settings.enabled,
    interval: form.elements.interval.value,
    questionCount: form.elements.questionCount.value,
    skills,
  });
}

function updateRoutineSummary() {
  const checked = $$("[data-skill]:checked");
  const questionCount = Math.max(3, Math.min(20, Number($("#routine-form").elements.questionCount.value) || 6));
  $("#routine-summary").textContent = checked.length
    ? `${checked.length} skill${checked.length === 1 ? "" : "s"} will rotate through each ${questionCount}-challenge set.`
    : "Choose at least one skill to save this routine.";
  const allSelected = checked.length === Object.keys(Trainer.SKILLS).length;
  $("#select-all").textContent = allSelected ? "Clear all" : "Select all";
}

async function saveRoutine(event) {
  event.preventDefault();
  const rawChecked = $$("[data-skill]:checked");
  if (!rawChecked.length) {
    showToast("Choose at least one arithmetic or memory skill.");
    return;
  }
  const settings = getFormSettings();
  state.settings = settings;
  await chrome.storage.local.set({ settings });
  showToast("Routine saved. Your next set will use the new mix.");
  await refreshAlarm();
}

async function toggleRoutine() {
  const settings = {
    ...state.settings,
    enabled: !state.settings.enabled,
    skills: { ...state.settings.skills },
  };
  state.settings = settings;
  renderRoutineState();
  await chrome.storage.local.set({ settings });
  showToast(settings.enabled ? "Routine resumed." : "Routine paused. Practice sets are still available.");
  await refreshAlarm();
}

function selectAllSkills() {
  const inputs = $$("[data-skill]");
  const shouldSelect = !inputs.every((input) => input.checked);
  inputs.forEach((input) => {
    input.checked = shouldSelect;
  });
  updateRoutineSummary();
}

async function trainNow() {
  const button = $("#train-now");
  button.disabled = true;
  button.textContent = "Preparing your set…";
  try {
    const response = await chrome.runtime.sendMessage({ type: "TRIGGER_SESSION" });
    if (!response?.ok) throw new Error("Could not queue session");
    showToast(response.delivered
      ? "Practice set opened on your normal webpage tabs."
      : "Practice set queued. Open any normal webpage to begin.");
  } catch {
    showToast("Chrome could not start a set yet. Try again in a moment.");
  } finally {
    button.disabled = false;
    button.innerHTML = "Start a practice set <span>→</span>";
  }
}

async function refreshAlarm() {
  if (!state.settings.enabled) {
    state.nextAlarmTime = null;
    renderCountdown();
    return;
  }
  const alarm = await chrome.alarms.get("brainbreak:training");
  state.nextAlarmTime = alarm?.scheduledTime || null;
  renderCountdown();
}

function formatCountdown(timestamp) {
  const remaining = Math.max(0, timestamp - Date.now());
  const totalSeconds = Math.ceil(remaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function renderCountdown() {
  if (!state.settings.enabled) {
    $("#next-countdown").textContent = "Paused";
    $("#next-meta").textContent = "Practice whenever you like";
    return;
  }
  $("#next-countdown").textContent = state.nextAlarmTime
    ? formatCountdown(state.nextAlarmTime)
    : "Scheduling…";
  const activeCount = Trainer.enabledSkills(state.settings).length;
  $("#next-meta").textContent = `${state.settings.questionCount} challenges · ${activeCount} skill${activeCount === 1 ? "" : "s"}`;
}

function renderHistory() {
  const history = [...state.history].reverse().slice(0, 12);
  if (!history.length) {
    $("#history-list").innerHTML = `
      <div class="empty-state">
        <div><strong>No completed sessions yet</strong><p>Start a practice set or wait for your first scheduled interruption. Your results will appear here.</p></div>
      </div>`;
    return;
  }

  $("#history-list").innerHTML = `
    <div class="history-header"><span>Completed</span><span>Accuracy</span><span>Response</span><span>Level changes</span><span>Skills practiced</span></div>
    ${history.map((item) => {
      const date = new Date(item.completedAt);
      const skills = (item.skills || []).filter((skill) => Trainer.SKILLS[skill]);
      const promotions = item.promotions?.length || 0;
      return `
        <div class="history-row">
          <div class="history-date"><strong>${date.toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" })}</strong><small>${date.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })} · ${item.challengeCount || 0} challenges${item.manual ? " · practice" : ""}</small></div>
          <strong>${item.accuracy ?? "—"}%</strong>
          <span>${item.averageResponseMs ? `${(item.averageResponseMs / 1000).toFixed(1)}s` : "—"}</span>
          <span class="${promotions ? "level-up" : ""}">${promotions ? `↑ ${promotions} level up${promotions === 1 ? "" : "s"}` : "No change"}</span>
          <div class="history-skills">${skills.map((key) => `<i data-history-skill="${key}" title="${Trainer.SKILLS[key].label}">${Trainer.SKILLS[key].symbol}</i>`).join("")}</div>
        </div>`;
    }).join("")}`;

  $$("[data-history-skill]").forEach((icon) => {
    icon.style.setProperty("--history-color", Trainer.SKILLS[icon.dataset.historySkill].color);
  });
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}
