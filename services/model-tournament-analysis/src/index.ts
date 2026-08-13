export type TournamentObservation = {
  taskId: string;
  repositoryId: string;
  retrieval: { exactSourceIncluded: boolean };
  execution: { syntax: string; visible: string; hidden: string };
  outcome: { behavioralSuccess: boolean; firstFailureStage: string };
};

export type OutcomeMetric = "strictBehavioral" | "syntax" | "visible" | "hidden";

const pass = (row: TournamentObservation, metric: OutcomeMetric) =>
  metric === "strictBehavioral" ? row.outcome.behavioralSuccess
    : metric === "syntax" ? row.execution.syntax === "PASS"
      : metric === "visible" ? row.execution.visible === "PASS"
        : row.execution.hidden === "PASS";

function percentile(values: number[], probability: number) {
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

export function exactMcNemar(leftOnly: number, rightOnly: number) {
  const discordant = leftOnly + rightOnly;
  if (!discordant) return 1;
  const extreme = Math.min(leftOnly, rightOnly);
  let cumulative = 0;
  for (let k = 0; k <= extreme; k += 1) {
    let combination = 1;
    for (let j = 1; j <= k; j += 1) combination = combination * (discordant - j + 1) / j;
    cumulative += combination * 0.5 ** discordant;
  }
  return Math.min(1, 2 * cumulative);
}

export function pairedAnalysis(
  leftRows: TournamentObservation[],
  rightRows: TournamentObservation[],
  metric: OutcomeMetric,
  leftLabel: string,
  rightLabel: string,
  seed = 20260811,
) {
  if (leftRows.length !== 95 || rightRows.length !== 95) throw new Error("Paired population must be 95");
  const leftByTask = new Map(leftRows.map((row) => [row.taskId, row]));
  const pairs = rightRows.map((right) => ({ left: leftByTask.get(right.taskId), right }));
  if (pairs.some(({ left, right }) => !left || left.repositoryId !== right.repositoryId) || new Set(rightRows.map((row) => row.taskId)).size !== 95) throw new Error("Paired task/repository identity mismatch");
  let bothPass = 0, leftOnly = 0, rightOnly = 0, bothFail = 0;
  for (const pair of pairs) {
    const leftPass = pass(pair.left!, metric), rightPass = pass(pair.right, metric);
    if (leftPass && rightPass) bothPass += 1;
    else if (leftPass) leftOnly += 1;
    else if (rightPass) rightOnly += 1;
    else bothFail += 1;
  }
  const sample = (cluster: boolean) => {
    const rng = random(seed), values: number[] = [];
    const repositories = [...new Set(pairs.map(({ right }) => right.repositoryId))].sort();
    const units = cluster ? repositories.map((repository) => pairs.filter(({ right }) => right.repositoryId === repository)) : pairs.map((pair) => [pair]);
    for (let repetition = 0; repetition < 10_000; repetition += 1) {
      let delta = 0, count = 0;
      for (let index = 0; index < units.length; index += 1) {
        const unit = units[Math.floor(rng() * units.length)];
        for (const pair of unit) {
          delta += Number(pass(pair.right, metric)) - Number(pass(pair.left!, metric));
          count += 1;
        }
      }
      values.push(100 * delta / count);
    }
    return [percentile(values, 0.025), percentile(values, 0.975)] as [number, number];
  };
  return {
    metric,
    population: 95,
    leftLabel,
    rightLabel,
    bothPass,
    leftOnly,
    rightOnly,
    bothFail,
    leftSuccesses: bothPass + leftOnly,
    rightSuccesses: bothPass + rightOnly,
    absoluteDifferencePercentagePoints: 100 * (rightOnly - leftOnly) / 95,
    statistics: {
      repetitions: 10_000,
      seed,
      taskPairedBootstrap95PercentCI: sample(false),
      repositoryClusterBootstrap95PercentCI: sample(true),
      mcnemarExactTwoSidedP: exactMcNemar(leftOnly, rightOnly),
      discordantPairs: leftOnly + rightOnly,
    },
  };
}

export function failureProfile(rows: TournamentObservation[]) {
  const profile = { RETRIEVAL: 0, ACTION_VALIDATION: 0, PATCH_CONSTRUCTION: 0, SYNTAX_TYPE: 0, VISIBLE_TEST: 0, HIDDEN_TEST: 0, SUCCESS: 0, TOOL_INFRASTRUCTURE: 0, OTHER: 0 };
  for (const row of rows) {
    const stage = !row.retrieval.exactSourceIncluded ? "RETRIEVAL" : row.outcome.firstFailureStage === "COMPLETE" ? "SUCCESS" : row.outcome.firstFailureStage;
    if (Object.hasOwn(profile, stage)) profile[stage as keyof typeof profile] += 1;
    else profile.OTHER += 1;
  }
  return profile;
}

export function thresholdClassification(successes: number) {
  if (!Number.isInteger(successes) || successes < 0 || successes > 95) throw new Error("Invalid success count");
  return {
    successes,
    denominator: 95,
    highestClassification: successes >= 57 ? "PRODUCT_THRESHOLD" : successes >= 40 ? "STRONG_CANDIDATE" : successes >= 33 ? "RESEARCH_THRESHOLD" : successes >= 29 ? "ASSISTED_FLOOR" : "BELOW_ASSISTED",
    gates: {
      assistedFloor29: successes >= 29,
      researchThreshold33: successes >= 33,
      strongCandidate40: successes >= 40,
      productThreshold57: successes >= 57,
    },
  };
}
