const assert = require("node:assert/strict");
const Trainer = require("../trainer.js");

function settingsFor(skill, questionCount = 6) {
  return {
    enabled: true,
    interval: 30,
    questionCount,
    skills: Object.fromEntries(Object.keys(Trainer.SKILLS).map((key) => [key, key === skill])),
  };
}

{
  const settings = Trainer.normalizeSettings({
    enabled: false,
    interval: -2,
    questionCount: 99,
    skills: Object.fromEntries(Object.keys(Trainer.SKILLS).map((key) => [key, false])),
  });
  assert.equal(settings.enabled, false);
  assert.equal(settings.interval, 1);
  assert.equal(settings.questionCount, 20);
  assert.equal(settings.skills.addition, true, "normalization keeps at least one skill active");
}

{
  const profiles = Trainer.normalizeProfiles();
  const first = Trainer.createSessionPlan(Trainer.DEFAULT_SETTINGS, profiles, "fixed-seed");
  const second = Trainer.createSessionPlan(Trainer.DEFAULT_SETTINGS, profiles, "fixed-seed");
  assert.deepEqual(first, second, "plans are deterministic across blocked tabs");
  assert.equal(first.length, Trainer.DEFAULT_SETTINGS.questionCount);
  assert.equal(new Set(first.map((item) => item.skill)).size, 6);
}

for (const skill of ["addition", "subtraction", "multiplication", "division"]) {
  const plan = Trainer.createSessionPlan(settingsFor(skill), Trainer.normalizeProfiles(), `math-${skill}`);
  assert.equal(plan.length, 6);
  plan.forEach((challenge) => {
    assert.equal(challenge.type, "arithmetic");
    assert.equal(challenge.skill, skill);
    assert.equal(Trainer.isAnswerCorrect(challenge, challenge.answer), true);
    assert.equal(Trainer.isAnswerCorrect(challenge, `${Number(challenge.answer) + 1}`), false);
  });
}

{
  const profiles = Trainer.normalizeProfiles({ digits: { level: 7 } });
  const [challenge] = Trainer.createSessionPlan(settingsFor("digits", 3), profiles, "digits");
  assert.equal(challenge.memoryType, "digits");
  assert.equal(challenge.prompt.length, 11);
  assert.equal(Trainer.isAnswerCorrect(challenge, challenge.prompt.split("").join(" ")), true);
}

{
  const profiles = Trainer.normalizeProfiles({ sentence: { level: 8 } });
  const [challenge] = Trainer.createSessionPlan(settingsFor("sentence", 3), profiles, "sentence");
  assert.equal(challenge.memoryType, "sentence");
  const relaxed = challenge.answer.toUpperCase().replace(/[,.']/g, "");
  assert.equal(Trainer.isAnswerCorrect(challenge, relaxed), true);
  assert.equal(Trainer.isAnswerCorrect(challenge, `${relaxed} extra`), false);
}

{
  const profiles = Trainer.normalizeProfiles({
    addition: { level: 2, mastery: 4, streak: 2, bestStreak: 2 },
  });
  const update = Trainer.applyResults(profiles, [{
    skill: "addition",
    attempts: 1,
    elapsedMs: 3000,
    targetMs: 16000,
    level: 2,
  }], 12345);
  assert.equal(update.profiles.addition.level, 3);
  assert.equal(update.profiles.addition.mastery, 0);
  assert.equal(update.profiles.addition.streak, 3);
  assert.equal(update.promotions.length, 1);
}

{
  const profiles = Trainer.normalizeProfiles({
    division: { level: 4, mastery: -2, streak: 4, bestStreak: 4 },
  });
  const update = Trainer.applyResults(profiles, [{
    skill: "division",
    attempts: 3,
    elapsedMs: 45000,
    targetMs: 18000,
    level: 4,
  }], 12345);
  assert.equal(update.profiles.division.level, 3);
  assert.equal(update.profiles.division.streak, 0);
  assert.equal(update.demotions.length, 1);
}

console.log("Brainbreak trainer tests passed.");
