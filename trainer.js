(() => {
  const SKILLS = {
    addition: {
      label: "Addition",
      shortLabel: "Add",
      symbol: "+",
      group: "arithmetic",
      color: "#d9ff43",
    },
    subtraction: {
      label: "Subtraction",
      shortLabel: "Subtract",
      symbol: "−",
      group: "arithmetic",
      color: "#ff8a65",
    },
    multiplication: {
      label: "Multiplication",
      shortLabel: "Multiply",
      symbol: "×",
      group: "arithmetic",
      color: "#8d7dff",
    },
    division: {
      label: "Division",
      shortLabel: "Divide",
      symbol: "÷",
      group: "arithmetic",
      color: "#51d9bd",
    },
    digits: {
      label: "Number recall",
      shortLabel: "Digits",
      symbol: "123",
      group: "memory",
      color: "#56b5ff",
    },
    sentence: {
      label: "Sentence recall",
      shortLabel: "Words",
      symbol: "Aa",
      group: "memory",
      color: "#f2a6ff",
    },
  };

  const DEFAULT_SETTINGS = {
    enabled: true,
    interval: 30,
    questionCount: 6,
    skills: {
      addition: true,
      subtraction: true,
      multiplication: true,
      division: true,
      digits: true,
      sentence: true,
    },
  };

  const SENTENCES = [
    { level: 1, text: "Bright birds cross the quiet lake." },
    { level: 1, text: "Fresh bread cooled beside the window." },
    { level: 1, text: "The small clock chimed at noon." },
    { level: 2, text: "A silver bicycle waited beneath the old oak." },
    { level: 2, text: "Three yellow lanterns glowed across the narrow street." },
    { level: 2, text: "Warm sunlight filled every corner of the kitchen." },
    { level: 3, text: "The patient gardener counted seven new roses before breakfast." },
    { level: 3, text: "Maya left her blue notebook beside the station map." },
    { level: 3, text: "A curious fox watched the snowfall from a rocky hill." },
    { level: 4, text: "Before sunset, Daniel carried two heavy boxes into the quiet library." },
    { level: 4, text: "The green train arrived early despite the rain over the valley." },
    { level: 4, text: "Four polished stones rested inside a faded wooden bowl." },
    { level: 5, text: "Every Tuesday morning, the baker places cinnamon rolls near the front window." },
    { level: 5, text: "A gentle breeze moved the red curtains while the radio played softly." },
    { level: 5, text: "Nora remembered to pack a compass, a scarf, and three oranges." },
    { level: 6, text: "Although the path was steep, our cheerful guide reached the waterfall before anyone else." },
    { level: 6, text: "The museum guard found a tiny brass key underneath the marble staircase." },
    { level: 6, text: "Just after midnight, distant thunder rolled slowly across the sleeping coastal town." },
    { level: 7, text: "Professor Lin carefully arranged twelve glass bottles according to color, height, and weight." },
    { level: 7, text: "When the final bell rang, five students remained to finish the complicated puzzle." },
    { level: 8, text: "The handwritten letter described a hidden garden where purple flowers opened only during winter." },
    { level: 8, text: "After checking the weather twice, Elena packed her camera and followed the northern trail." },
    { level: 9, text: "At exactly six fifteen, the old theater displayed a message about tomorrow's unexpected performance." },
    { level: 9, text: "Beneath a pale morning sky, the research team recorded each unusual sound from the forest." },
    { level: 10, text: "Because the original recipe was missing, Amir combined roasted almonds, orange peel, and dark chocolate." },
    { level: 10, text: "The captain calmly explained that the ferry would depart once the eastern lighthouse flashed twice." },
    { level: 11, text: "During the crowded exhibition, a young architect sketched the curved ceiling and its forty copper panels." },
    { level: 11, text: "Our neighbor promised to water the balcony plants every second evening until we returned from Lisbon." },
    { level: 12, text: "Long before the conference began, Priya reviewed the final report, corrected six figures, and replaced two diagrams." },
    { level: 12, text: "While everyone watched the horizon, a narrow ribbon of golden light appeared between the storm clouds." },
  ];

  const magnitudeByLevel = [
    10, 20, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000,
  ];
  const factorByLevel = [5, 8, 10, 12, 15, 20, 25, 35, 45, 60, 75, 99];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function normalizeSettings(value = {}) {
    const sourceSkills = value.skills && typeof value.skills === "object" ? value.skills : {};
    const skills = {};
    Object.keys(SKILLS).forEach((key) => {
      skills[key] = typeof sourceSkills[key] === "boolean"
        ? sourceSkills[key]
        : DEFAULT_SETTINGS.skills[key];
    });
    if (!Object.values(skills).some(Boolean)) skills.addition = true;
    return {
      enabled: typeof value.enabled === "boolean" ? value.enabled : DEFAULT_SETTINGS.enabled,
      interval: clamp(Math.round(Number(value.interval) || DEFAULT_SETTINGS.interval), 1, 1440),
      questionCount: clamp(
        Math.round(Number(value.questionCount) || DEFAULT_SETTINGS.questionCount),
        3,
        20,
      ),
      skills,
    };
  }

  function defaultSkillProfile() {
    return {
      level: 1,
      mastery: 0,
      correct: 0,
      attempts: 0,
      streak: 0,
      bestStreak: 0,
      lastPracticedAt: null,
    };
  }

  function normalizeProfiles(value = {}) {
    const profiles = {};
    Object.keys(SKILLS).forEach((skill) => {
      const source = value[skill] || {};
      profiles[skill] = {
        level: clamp(Math.round(Number(source.level) || 1), 1, 12),
        mastery: clamp(Math.round(Number(source.mastery) || 0), -2, 5),
        correct: Math.max(0, Math.round(Number(source.correct) || 0)),
        attempts: Math.max(0, Math.round(Number(source.attempts) || 0)),
        streak: Math.max(0, Math.round(Number(source.streak) || 0)),
        bestStreak: Math.max(0, Math.round(Number(source.bestStreak) || 0)),
        lastPracticedAt: Number(source.lastPracticedAt) || null,
      };
    });
    return profiles;
  }

  function enabledSkills(settings) {
    const normalized = normalizeSettings(settings);
    return Object.keys(SKILLS).filter((key) => normalized.skills[key]);
  }

  function hashSeed(value) {
    let hash = 2166136261;
    const input = String(value);
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seededRandom(seed) {
    let state = hashSeed(seed);
    return () => {
      state += 0x6d2b79f5;
      let result = state;
      result = Math.imul(result ^ (result >>> 15), result | 1);
      result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
      return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randomInteger(random, minimum, maximum) {
    return Math.floor(random() * (maximum - minimum + 1)) + minimum;
  }

  function shuffle(values, random) {
    const output = [...values];
    for (let index = output.length - 1; index > 0; index -= 1) {
      const target = randomInteger(random, 0, index);
      [output[index], output[target]] = [output[target], output[index]];
    }
    return output;
  }

  function signedValue(value) {
    return value < 0 ? `−${Math.abs(value)}` : String(value);
  }

  function arithmeticChallenge(skill, level, random) {
    const magnitude = magnitudeByLevel[level - 1];
    let answer;
    let expression;

    if (skill === "addition") {
      const operandCount = level >= 5 ? 3 : 2;
      const values = Array.from(
        { length: operandCount },
        () => randomInteger(random, level >= 8 ? -Math.floor(magnitude / 3) : 0, magnitude),
      );
      answer = values.reduce((sum, value) => sum + value, 0);
      expression = values.map(signedValue).join(" + ").replace(/\+ −/g, "− ");
    } else if (skill === "subtraction") {
      let first = randomInteger(random, 1, magnitude);
      let second = randomInteger(random, 1, magnitude);
      if (level < 5 && second > first) [first, second] = [second, first];
      if (level >= 9 && random() > 0.65) first *= -1;
      answer = first - second;
      expression = `${signedValue(first)} − ${signedValue(second)}`;
    } else if (skill === "multiplication") {
      const factor = factorByLevel[level - 1];
      let first = randomInteger(random, 2, factor);
      let second = randomInteger(random, 2, level >= 8 ? Math.min(99, factor + 15) : factor);
      if (level >= 10 && random() > 0.75) first *= -1;
      answer = first * second;
      expression = `${signedValue(first)} × ${signedValue(second)}`;
    } else {
      const factor = factorByLevel[level - 1];
      const divisor = randomInteger(random, 2, factor);
      let quotient = randomInteger(random, 2, level >= 7 ? Math.min(75, factor + 10) : factor);
      if (level >= 9 && random() > 0.7) quotient *= -1;
      const dividend = divisor * quotient;
      answer = quotient;
      expression = `${signedValue(dividend)} ÷ ${divisor}`;
    }

    const baseTarget = skill === "multiplication" || skill === "division" ? 20000 : 16000;
    return {
      type: "arithmetic",
      skill,
      level,
      prompt: expression,
      answer: String(answer),
      targetMs: Math.max(6000, baseTarget - ((level - 1) * 700)),
    };
  }

  function digitChallenge(level, random) {
    const length = Math.min(24, 4 + level);
    let value = String(randomInteger(random, 1, 9));
    while (value.length < length) value += randomInteger(random, 0, 9);
    return {
      type: "memory",
      memoryType: "digits",
      skill: "digits",
      level,
      prompt: value,
      answer: value,
      length,
      displaySeconds: Math.max(3, 7 - Math.floor((level - 1) / 3)),
      targetMs: Math.max(12000, 26000 - ((level - 1) * 600)),
    };
  }

  function sentenceChallenge(level, random) {
    const available = SENTENCES.filter((item) => item.level <= level);
    const closest = available.filter((item) => item.level >= Math.max(1, level - 1));
    const source = closest.length ? closest : available;
    const sentence = source[randomInteger(random, 0, source.length - 1)].text;
    return {
      type: "memory",
      memoryType: "sentence",
      skill: "sentence",
      level,
      prompt: sentence,
      answer: sentence,
      wordCount: normalizeText(sentence).split(" ").length,
      displaySeconds: Math.max(5, 11 - Math.floor((level - 1) / 2)),
      targetMs: Math.max(18000, 42000 - ((level - 1) * 1000)),
    };
  }

  function generateChallenge(skill, level, random) {
    if (SKILLS[skill]?.group === "arithmetic") {
      return arithmeticChallenge(skill, level, random);
    }
    if (skill === "digits") return digitChallenge(level, random);
    return sentenceChallenge(level, random);
  }

  function createSessionPlan(settings, profiles, seed) {
    const normalizedSettings = normalizeSettings(settings);
    const normalizedProfiles = normalizeProfiles(profiles);
    const activeSkills = enabledSkills(normalizedSettings);
    const random = seededRandom(seed);
    const skillOrder = [];
    while (skillOrder.length < normalizedSettings.questionCount) {
      skillOrder.push(...shuffle(activeSkills, random));
    }
    return skillOrder
      .slice(0, normalizedSettings.questionCount)
      .map((skill) => generateChallenge(skill, normalizedProfiles[skill].level, random));
  }

  function normalizeText(value) {
    return String(value)
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[’']/g, "")
      .replace(/[^a-z0-9\s-]/g, " ")
      .replace(/-/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isAnswerCorrect(challenge, value) {
    if (!challenge) return false;
    if (challenge.type === "arithmetic") {
      const cleaned = String(value).replace(/[,\s]/g, "").replace(/−/g, "-");
      if (!cleaned || !/^-?\d+$/.test(cleaned)) return false;
      return Number(cleaned) === Number(challenge.answer);
    }
    if (challenge.memoryType === "digits") {
      return String(value).replace(/[\s-]/g, "") === String(challenge.answer);
    }
    return normalizeText(value) === normalizeText(challenge.answer);
  }

  function applyResults(existingProfiles, rawResults, completedAt = Date.now()) {
    const profiles = normalizeProfiles(existingProfiles);
    const promotions = [];
    const demotions = [];
    const results = Array.isArray(rawResults) ? rawResults : [];

    results.forEach((result) => {
      if (!SKILLS[result.skill]) return;
      const profile = profiles[result.skill];
      const attempts = clamp(Math.round(Number(result.attempts) || 1), 1, 99);
      const elapsedMs = clamp(Math.round(Number(result.elapsedMs) || 0), 0, 3600000);
      const targetMs = clamp(Math.round(Number(result.targetMs) || 20000), 3000, 120000);
      const firstTry = attempts === 1;
      const fast = elapsedMs > 0 && elapsedMs <= targetMs * 1.25;

      profile.correct += 1;
      profile.attempts += attempts;
      profile.streak = firstTry ? profile.streak + 1 : 0;
      profile.bestStreak = Math.max(profile.bestStreak, profile.streak);
      profile.lastPracticedAt = completedAt;
      profile.mastery += firstTry ? (fast ? 2 : 1) : -1;

      if (profile.mastery >= 6 && profile.level < 12) {
        const from = profile.level;
        profile.level += 1;
        profile.mastery = 0;
        promotions.push({ skill: result.skill, from, to: profile.level });
      } else if (profile.mastery <= -3 && profile.level > 1) {
        const from = profile.level;
        profile.level -= 1;
        profile.mastery = 0;
        demotions.push({ skill: result.skill, from, to: profile.level });
      } else {
        profile.mastery = clamp(profile.mastery, -2, 5);
      }
    });

    return { profiles, promotions, demotions };
  }

  const api = {
    SKILLS,
    DEFAULT_SETTINGS: clone(DEFAULT_SETTINGS),
    normalizeSettings,
    normalizeProfiles,
    enabledSkills,
    createSessionPlan,
    isAnswerCorrect,
    normalizeText,
    applyResults,
  };

  globalThis.BrainbreakTrainer = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
