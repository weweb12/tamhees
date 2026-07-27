import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compileContext } from '../core/context.js';
import { fixedClock, type MemoryRecord } from '../core/types.js';
import { ENGINE_VERSION, PRODUCT_NAME } from '../core/identity.js';
import { validateMemoryRecord } from '../core/validation.js';

export const BENCHMARK_CONFIGURATIONS = [
  'NO_MEMORY',
  'MONOLITHIC_GPTBRAIN',
  'SIMPLE_SPLIT_FILES',
  'TAMHEES',
] as const;
export type BenchmarkConfiguration = (typeof BENCHMARK_CONFIGURATIONS)[number];
export const BENCHMARK_NOW = '2026-07-22T12:00:00.000Z';
export const BENCHMARK_SCENARIO_IDS = [
  'technical-retrieval', 'stale-memory', 'conflicted-memory', 'revoked-memory',
  'superseded-memory', 'owner-constraint', 'inference-only', 'low-confidence',
  'missing-provenance', 'insufficient-permission', 'repository-evidence',
  'test-evidence', 'fake-secret-shape', 'sensitive-memory', 'budget-pressure',
  'multiple-relevant', 'no-relevant-memory', 'owner-escalation',
  'abstention-unsafe-only', 'unicode-task', 'equal-score-tie',
  'cross-adapter-equivalence',
] as const;

export interface BenchmarkGroundTruth {
  readonly relevantIds: readonly string[];
  readonly safeRelevantIds: readonly string[];
  readonly expectedSelectedIds: readonly string[];
  readonly authorityProblemIds: readonly string[];
  readonly freshnessProblemIds: readonly string[];
  readonly unsafeIds: readonly string[];
  readonly secretIds: readonly string[];
  readonly ownerEscalationExpected: boolean;
  readonly abstentionExpected: boolean;
}

export interface BenchmarkScenario {
  readonly id: string;
  readonly category: string;
  readonly task: string;
  readonly records: readonly MemoryRecord[];
  readonly groundTruth: BenchmarkGroundTruth;
  readonly maxTokens: number;
}

export interface BenchmarkFixture {
  readonly schemaVersion: '1.0.0';
  readonly effectiveAt: typeof BENCHMARK_NOW;
  readonly scenarios: readonly BenchmarkScenario[];
}

export interface NullableRatio {
  readonly numerator: number;
  readonly denominator: number;
  readonly value: number | null;
}

export interface RetrievalMetrics {
  readonly truePositive: number;
  readonly falsePositive: number;
  readonly falseNegative: number;
  readonly selectedCount: number;
  readonly relevantCount: number;
  readonly precision: number | null;
  readonly recall: number | null;
}

export interface BenchmarkMetrics {
  readonly retrieval: RetrievalMetrics;
  readonly authorityViolationPrevented: boolean | null;
  readonly authorityProblemDetected: boolean | null;
  readonly freshnessProblemDetected: boolean | null;
  readonly unsafeExposureCount: number;
  readonly secretLeakageCount: number;
  readonly ownerEscalationCorrect: boolean | null;
  readonly abstentionCorrect: boolean;
  readonly budgetCompliant: boolean;
  readonly outcomeCorrect: boolean;
  readonly selectedCount: number;
  readonly estimatedTokensUsed: number;
}

export interface BenchmarkScenarioResult {
  readonly scenarioId: string;
  readonly category: string;
  readonly selectedIds: readonly string[];
  readonly metrics: BenchmarkMetrics;
}

export interface BenchmarkAggregate {
  readonly retrievalMicro: {
    readonly truePositive: number;
    readonly falsePositive: number;
    readonly falseNegative: number;
    readonly selectedCount: number;
    readonly relevantCount: number;
    readonly precision: NullableRatio;
    readonly recall: NullableRatio;
  };
  readonly retrievalMacro: {
    readonly precision: NullableRatio;
    readonly recall: NullableRatio;
  };
  readonly authorityViolationPrevention: NullableRatio;
  readonly authorityProblemDetection: NullableRatio;
  readonly freshnessProblemDetection: NullableRatio;
  readonly ownerEscalationCorrectness: NullableRatio;
  readonly abstentionCorrectness: NullableRatio;
  readonly budgetCompliance: NullableRatio;
  readonly outcomeCorrectness: NullableRatio;
  readonly unsafeExposureCount: number;
  readonly secretLeakageCount: number;
  readonly meanSelectedCount: number;
  readonly meanEstimatedTokensUsed: number;
}

export interface BenchmarkConfigurationResult {
  readonly configuration: BenchmarkConfiguration;
  readonly scenarios: readonly BenchmarkScenarioResult[];
  readonly aggregate: BenchmarkAggregate;
}

export interface BenchmarkReport {
  readonly benchmarkVersion: '2.0.0';
  readonly engineVersion: typeof ENGINE_VERSION;
  readonly generatedAt: typeof BENCHMARK_NOW;
  readonly deterministic: true;
  readonly fixtureSha256: string;
  readonly methodology: {
    readonly groundTruthPolicy: string;
    readonly safetyAdjustedRecallPolicy: string;
    readonly undefinedMetricPolicy: string;
    readonly noMemoryPolicy: string;
    readonly configurationOrder: readonly BenchmarkConfiguration[];
    readonly scenarioCount: number;
  };
  readonly configurations: readonly BenchmarkConfigurationResult[];
}

interface ConfigurationOutput {
  readonly selected: readonly MemoryRecord[];
  readonly estimatedTokensUsed: number;
  readonly budgetCompliant: boolean;
  readonly detectedAuthorityIds: readonly string[] | null;
  readonly detectedFreshnessIds: readonly string[] | null;
  readonly ownerEscalated: boolean | null;
}

export function benchmarkFixturePath(): string {
  return resolve(process.cwd(), 'benchmark', 'fixtures', 'scenarios.json');
}

export function parseBenchmarkFixture(value: unknown): BenchmarkFixture {
  if (!isObject(value)
    || value['schemaVersion'] !== '1.0.0'
    || value['effectiveAt'] !== BENCHMARK_NOW
    || !Array.isArray(value['scenarios'])) {
    throw new Error('Benchmark fixture root is invalid.');
  }
  const scenarios = value['scenarios'];
  if (scenarios.length !== BENCHMARK_SCENARIO_IDS.length) throw new Error('Benchmark scenario catalogue is incomplete.');
  const observedIds: string[] = [];
  const allRecordIds = new Set<string>();
  for (const [index, raw] of scenarios.entries()) {
    if (!isObject(raw)) throw new Error('Benchmark scenario must be an object.');
    const expectedId = BENCHMARK_SCENARIO_IDS[index]!;
    if (raw['id'] !== expectedId) throw new Error('Benchmark scenario IDs or ordering changed.');
    if (typeof raw['category'] !== 'string' || raw['category'].length === 0
      || typeof raw['task'] !== 'string' || raw['task'].length === 0
      || !Number.isSafeInteger(raw['maxTokens']) || (raw['maxTokens'] as number) < 1
      || !Array.isArray(raw['records']) || !isObject(raw['groundTruth'])) {
      throw new Error('Benchmark scenario structure is invalid.');
    }
    observedIds.push(expectedId);
    const recordIds = new Set<string>();
    for (const record of raw['records']) {
      const validation = validateMemoryRecord(record);
      if (!validation.valid) throw new Error('Benchmark fixture contains an invalid memory record.');
      const id = (record as MemoryRecord).id;
      if (recordIds.has(id) || allRecordIds.has(id)) throw new Error('Benchmark record IDs must be globally unique.');
      recordIds.add(id);
      allRecordIds.add(id);
    }
    validateGroundTruth(raw['groundTruth'], recordIds);
  }
  if (new Set(observedIds).size !== observedIds.length) throw new Error('Benchmark scenario IDs must be unique.');
  return value as unknown as BenchmarkFixture;
}

export function loadBenchmarkFixture(): { fixture: BenchmarkFixture; sha256: string } {
  const bytes = readFileSync(benchmarkFixturePath());
  const fixture = parseBenchmarkFixture(JSON.parse(bytes.toString('utf8')) as unknown);
  return { fixture, sha256: createHash('sha256').update(bytes).digest('hex') };
}

export function benchmarkScenarios(): readonly BenchmarkScenario[] {
  return loadBenchmarkFixture().fixture.scenarios;
}

export function runBenchmark(fixtureInput?: BenchmarkFixture): BenchmarkReport {
  const loaded = fixtureInput === undefined ? loadBenchmarkFixture() : {
    fixture: parseBenchmarkFixture(fixtureInput),
    sha256: createHash('sha256').update(JSON.stringify(fixtureInput)).digest('hex'),
  };
  const scenarios = loaded.fixture.scenarios;
  return {
    benchmarkVersion: '2.0.0',
    engineVersion: ENGINE_VERSION,
    generatedAt: BENCHMARK_NOW,
    deterministic: true,
    fixtureSha256: loaded.sha256,
    methodology: {
      groundTruthPolicy: 'All relevance, safety, authority, freshness, escalation, and abstention labels are authored explicitly in the immutable fixture and are never generated from configuration output.',
      safetyAdjustedRecallPolicy: 'Retrieval precision and recall use safeRelevantIds. Task-relevant but unsafe records remain explicit in relevantIds and unsafeIds, but are not counted as false negatives when policy correctly prevents exposure.',
      undefinedMetricPolicy: 'A zero selected denominator makes precision null; a zero safe-relevant denominator makes recall null. Null scenario values are excluded from macro means and all ratios include numerators and denominators.',
      noMemoryPolicy: 'NO_MEMORY selects and classifies nothing. Detection and escalation metrics are null, while exposure, abstention, budget, retrieval, and exact outcome remain measurable.',
      configurationOrder: BENCHMARK_CONFIGURATIONS,
      scenarioCount: scenarios.length,
    },
    configurations: BENCHMARK_CONFIGURATIONS.map((configuration) => evaluateConfiguration(configuration, scenarios)),
  };
}

function validateGroundTruth(value: Record<string, unknown>, recordIds: ReadonlySet<string>): void {
  const arrays = [
    'relevantIds', 'safeRelevantIds', 'expectedSelectedIds', 'authorityProblemIds',
    'freshnessProblemIds', 'unsafeIds', 'secretIds',
  ] as const;
  for (const key of arrays) {
    const ids = value[key];
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string' || !recordIds.has(id))
      || new Set(ids).size !== ids.length) {
      throw new Error('Benchmark ground-truth IDs are invalid.');
    }
  }
  if (typeof value['ownerEscalationExpected'] !== 'boolean' || typeof value['abstentionExpected'] !== 'boolean') {
    throw new Error('Benchmark ground-truth labels must be explicit booleans.');
  }
  const relevant = new Set(value['relevantIds'] as string[]);
  const safe = value['safeRelevantIds'] as string[];
  const expected = value['expectedSelectedIds'] as string[];
  if (safe.some((id) => !relevant.has(id)) || expected.some((id) => !safe.includes(id))) {
    throw new Error('Safety-adjusted benchmark ground truth is inconsistent.');
  }
  if ((expected.length === 0) !== value['abstentionExpected']) {
    throw new Error('Abstention ground truth must agree with the expected selection.');
  }
}

function evaluateConfiguration(
  configuration: BenchmarkConfiguration,
  scenarios: readonly BenchmarkScenario[],
): BenchmarkConfigurationResult {
  const results = scenarios.map((scenario) => evaluateScenario(configuration, scenario));
  const retrieval = results.map((item) => item.metrics.retrieval);
  const truePositive = sum(retrieval.map((item) => item.truePositive));
  const falsePositive = sum(retrieval.map((item) => item.falsePositive));
  const falseNegative = sum(retrieval.map((item) => item.falseNegative));
  const selectedCount = sum(retrieval.map((item) => item.selectedCount));
  const relevantCount = sum(retrieval.map((item) => item.relevantCount));
  return {
    configuration,
    scenarios: results,
    aggregate: {
      retrievalMicro: {
        truePositive,
        falsePositive,
        falseNegative,
        selectedCount,
        relevantCount,
        precision: ratio(truePositive, selectedCount),
        recall: ratio(truePositive, relevantCount),
      },
      retrievalMacro: {
        precision: macroRatio(retrieval.map((item) => item.precision)),
        recall: macroRatio(retrieval.map((item) => item.recall)),
      },
      authorityViolationPrevention: booleanRatio(results.map((item) => item.metrics.authorityViolationPrevented)),
      authorityProblemDetection: booleanRatio(results.map((item) => item.metrics.authorityProblemDetected)),
      freshnessProblemDetection: booleanRatio(results.map((item) => item.metrics.freshnessProblemDetected)),
      ownerEscalationCorrectness: booleanRatio(results.map((item) => item.metrics.ownerEscalationCorrect)),
      abstentionCorrectness: booleanRatio(results.map((item) => item.metrics.abstentionCorrect)),
      budgetCompliance: booleanRatio(results.map((item) => item.metrics.budgetCompliant)),
      outcomeCorrectness: booleanRatio(results.map((item) => item.metrics.outcomeCorrect)),
      unsafeExposureCount: sum(results.map((item) => item.metrics.unsafeExposureCount)),
      secretLeakageCount: sum(results.map((item) => item.metrics.secretLeakageCount)),
      meanSelectedCount: rounded(sum(results.map((item) => item.metrics.selectedCount)) / results.length),
      meanEstimatedTokensUsed: rounded(sum(results.map((item) => item.metrics.estimatedTokensUsed)) / results.length),
    },
  };
}

function evaluateScenario(
  configuration: BenchmarkConfiguration,
  scenario: BenchmarkScenario,
): BenchmarkScenarioResult {
  const output = configurationOutput(configuration, scenario);
  const selectedIds = output.selected.map((record) => record.id);
  const safeRelevant = new Set(scenario.groundTruth.safeRelevantIds);
  const truePositive = selectedIds.filter((id) => safeRelevant.has(id)).length;
  const falsePositive = selectedIds.length - truePositive;
  const falseNegative = scenario.groundTruth.safeRelevantIds.filter((id) => !selectedIds.includes(id)).length;
  const authorityApplicable = scenario.groundTruth.authorityProblemIds.length > 0;
  const freshnessApplicable = scenario.groundTruth.freshnessProblemIds.length > 0;
  return {
    scenarioId: scenario.id,
    category: scenario.category,
    selectedIds,
    metrics: {
      retrieval: {
        truePositive,
        falsePositive,
        falseNegative,
        selectedCount: selectedIds.length,
        relevantCount: safeRelevant.size,
        precision: selectedIds.length === 0 ? null : rounded(truePositive / selectedIds.length),
        recall: safeRelevant.size === 0 ? null : rounded(truePositive / safeRelevant.size),
      },
      authorityViolationPrevented: authorityApplicable
        ? scenario.groundTruth.authorityProblemIds.every((id) => !selectedIds.includes(id))
        : null,
      authorityProblemDetected: !authorityApplicable || output.detectedAuthorityIds === null
        ? null
        : scenario.groundTruth.authorityProblemIds.every((id) => output.detectedAuthorityIds!.includes(id)),
      freshnessProblemDetected: !freshnessApplicable || output.detectedFreshnessIds === null
        ? null
        : scenario.groundTruth.freshnessProblemIds.every((id) => output.detectedFreshnessIds!.includes(id)),
      unsafeExposureCount: scenario.groundTruth.unsafeIds.filter((id) => selectedIds.includes(id)).length,
      secretLeakageCount: scenario.groundTruth.secretIds.filter((id) => selectedIds.includes(id)).length,
      ownerEscalationCorrect: output.ownerEscalated === null
        ? null
        : output.ownerEscalated === scenario.groundTruth.ownerEscalationExpected,
      abstentionCorrect: (selectedIds.length === 0) === scenario.groundTruth.abstentionExpected,
      budgetCompliant: output.budgetCompliant,
      outcomeCorrect: arraysEqual(selectedIds, scenario.groundTruth.expectedSelectedIds),
      selectedCount: selectedIds.length,
      estimatedTokensUsed: output.estimatedTokensUsed,
    },
  };
}

function configurationOutput(
  configuration: BenchmarkConfiguration,
  scenario: BenchmarkScenario,
): ConfigurationOutput {
  if (configuration === 'NO_MEMORY') {
    return {
      selected: [],
      estimatedTokensUsed: 0,
      budgetCompliant: true,
      detectedAuthorityIds: null,
      detectedFreshnessIds: null,
      ownerEscalated: null,
    };
  }
  if (configuration === 'MONOLITHIC_GPTBRAIN') {
    const estimatedTokensUsed = estimateJson(scenario.records);
    return {
      selected: scenario.records,
      estimatedTokensUsed,
      budgetCompliant: estimatedTokensUsed <= scenario.maxTokens,
      detectedAuthorityIds: null,
      detectedFreshnessIds: null,
      ownerEscalated: null,
    };
  }
  if (configuration === 'SIMPLE_SPLIT_FILES') {
    const taskTerms = words(scenario.task);
    const selected = scenario.records.filter((record) => {
      const recordTerms = new Set([...words(record.statement), ...record.tags.map(normalizeTerm)]);
      return [...taskTerms].some((term) => recordTerms.has(term));
    });
    const estimatedTokensUsed = estimateJson(selected);
    return {
      selected,
      estimatedTokensUsed,
      budgetCompliant: estimatedTokensUsed <= scenario.maxTokens,
      detectedAuthorityIds: null,
      detectedFreshnessIds: null,
      ownerEscalated: null,
    };
  }

  const pack = compileContext(
    scenario.task,
    scenario.records,
    fixedClock(BENCHMARK_NOW),
    [],
    { maxTokens: scenario.maxTokens },
  );
  const byId = new Map(scenario.records.map((record) => [record.id, record]));
  return {
    selected: pack.selected.map((selection) => byId.get(selection.memoryId)!).filter(Boolean),
    estimatedTokensUsed: pack.budget.estimatedTokensUsed,
    budgetCompliant: pack.budget.compliant,
    detectedAuthorityIds: pack.excluded
      .filter((item) => ['blocked', 'conflicted', 'revoked'].includes(item.reasonCode))
      .map((item) => item.memoryId),
    detectedFreshnessIds: pack.excluded
      .filter((item) => ['expired', 'revoked'].includes(item.reasonCode))
      .map((item) => item.memoryId),
    ownerEscalated: pack.selected.some((selection) => selection.auditOutcome === 'ASK_OWNER'),
  };
}

function estimateJson(value: unknown): number {
  return Math.max(1, Math.ceil(Buffer.byteLength(JSON.stringify(value), 'utf8') / 4));
}
function words(value: string): Set<string> {
  return new Set((value.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? [])
    .filter((word) => word.length >= 3)
    .map(normalizeTerm));
}
function normalizeTerm(value: string): string { return value.normalize('NFKC').toLowerCase(); }
function ratio(numerator: number, denominator: number): NullableRatio {
  return { numerator, denominator, value: denominator === 0 ? null : rounded(numerator / denominator) };
}
function macroRatio(values: readonly (number | null)[]): NullableRatio {
  const defined = values.filter((value): value is number => value !== null);
  return ratio(rounded(sum(defined)), defined.length);
}
function booleanRatio(values: readonly (boolean | null)[]): NullableRatio {
  const defined = values.filter((value): value is boolean => value !== null);
  return ratio(defined.filter(Boolean).length, defined.length);
}
function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
function rounded(value: number): number { return Math.round(value * 1_000_000) / 1_000_000; }
function sum(values: readonly number[]): number { return values.reduce((total, value) => total + value, 0); }
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function formatBenchmarkJson(report: BenchmarkReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function formatBenchmarkMarkdown(report: BenchmarkReport): string {
  const header = '| Configuration | Micro precision | Micro recall | Authority prevention | Authority detection | Freshness detection | Unsafe exposures | Secret leaks | Owner escalation | Abstention | Budget | Exact outcome |';
  const rows = report.configurations.map(({ configuration, aggregate }) => [
    `| ${configuration}`,
    displayRatio(aggregate.retrievalMicro.precision),
    displayRatio(aggregate.retrievalMicro.recall),
    displayPercent(aggregate.authorityViolationPrevention),
    displayPercent(aggregate.authorityProblemDetection),
    displayPercent(aggregate.freshnessProblemDetection),
    String(aggregate.unsafeExposureCount),
    String(aggregate.secretLeakageCount),
    displayPercent(aggregate.ownerEscalationCorrectness),
    displayPercent(aggregate.abstentionCorrectness),
    displayPercent(aggregate.budgetCompliance),
    `${displayPercent(aggregate.outcomeCorrectness)} |`,
  ].join(' | '));
  const scenarioEvidence = report.configurations.map(({ configuration, aggregate }) =>
    `- ${configuration}: TP=${aggregate.retrievalMicro.truePositive}, FP=${aggregate.retrievalMicro.falsePositive}, FN=${aggregate.retrievalMicro.falseNegative}, selected=${aggregate.retrievalMicro.selectedCount}, safe-relevant=${aggregate.retrievalMicro.relevantCount}.`,
  );
  return `# ${PRODUCT_NAME} deterministic benchmark

- Version: ${report.benchmarkVersion}
- Engine: ${report.engineVersion}
- Scenarios: ${report.methodology.scenarioCount}
- Fixture SHA-256: \`${report.fixtureSha256}\`

${header}
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
${rows.join('\n')}

## Retrieval evidence

${scenarioEvidence.join('\n')}

## Metric policy

- Precision is \`null\` when selected count is zero; recall is \`null\` when safe-relevant count is zero. Null scenario values are excluded from macro means.
- Retrieval recall uses fixture-authored safety-adjusted ground truth. Unsafe but task-relevant records remain explicit in the JSON and are measured as prevented exposure, not false-negative retrieval.
- Detection, prevention, exposure, escalation, abstention, budget compliance, and exact outcome are separate metrics.
- NO_MEMORY performs no classification, so authority detection, freshness detection, and owner escalation are \`null\`; returning nothing is not credited as detection.
- Every aggregate ratio in JSON includes its numerator and denominator. The JSON also contains TP, FP, FN, selected count, and relevant count for every scenario.

## Limitations

- Retrieval is deterministic exact normalized lexical/tag matching, not semantic retrieval.
- Estimated tokens use the local UTF-8-byte estimator or documented baseline JSON estimate, not a provider tokenizer.
- The harness measures deterministic fixture outcomes; it does not claim subjective model quality or universal superiority.
`;
}

function displayRatio(value: NullableRatio): string {
  return value.value === null ? `null (${value.numerator}/${value.denominator})` : `${value.value.toFixed(3)} (${value.numerator}/${value.denominator})`;
}
function displayPercent(value: NullableRatio): string {
  return value.value === null ? `null (${value.numerator}/${value.denominator})` : `${(value.value * 100).toFixed(1)}% (${value.numerator}/${value.denominator})`;
}
