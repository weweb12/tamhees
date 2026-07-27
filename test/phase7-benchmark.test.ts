import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import {
  BENCHMARK_CONFIGURATIONS,
  BENCHMARK_SCENARIO_IDS,
  benchmarkScenarios,
  formatBenchmarkJson,
  formatBenchmarkMarkdown,
  loadBenchmarkFixture,
  parseBenchmarkFixture,
  runBenchmark,
  type BenchmarkFixture,
} from '../src/benchmark/benchmark.js';

describe('Phase 7 deterministic benchmark', () => {
  it('loads the complete stable unique fixture-authored scenario catalogue', () => {
    const scenarios = benchmarkScenarios();
    assert.equal(scenarios.length, 22);
    assert.deepEqual(scenarios.map((item) => item.id), BENCHMARK_SCENARIO_IDS);
    assert.equal(new Set(scenarios.map((item) => item.id)).size, scenarios.length);
    assert.equal(new Set(scenarios.flatMap((item) => item.records.map((record) => record.id))).size,
      scenarios.reduce((count, item) => count + item.records.length, 0));
    for (const scenario of scenarios) {
      assert.equal(typeof scenario.groundTruth.ownerEscalationExpected, 'boolean');
      assert.equal(typeof scenario.groundTruth.abstentionExpected, 'boolean');
      assert.ok(Array.isArray(scenario.groundTruth.relevantIds));
      assert.ok(Array.isArray(scenario.groundTruth.safeRelevantIds));
      assert.ok(Array.isArray(scenario.groundTruth.unsafeIds));
    }
  });

  it('runs exactly four configurations over the same tasks and records in documented order', () => {
    const report = runBenchmark();
    assert.deepEqual(report.configurations.map((item) => item.configuration), BENCHMARK_CONFIGURATIONS);
    assert.deepEqual(BENCHMARK_CONFIGURATIONS, [
      'NO_MEMORY', 'MONOLITHIC_GPTBRAIN', 'SIMPLE_SPLIT_FILES', 'TAMHEES',
    ]);
    for (const result of report.configurations) {
      assert.deepEqual(result.scenarios.map((item) => item.scenarioId), BENCHMARK_SCENARIO_IDS);
    }
  });

  it('regenerates JSON and Markdown from one canonical object byte-for-byte', async () => {
    const report = runBenchmark();
    assert.equal(formatBenchmarkJson(report), formatBenchmarkJson(runBenchmark()));
    assert.equal(formatBenchmarkMarkdown(report), formatBenchmarkMarkdown(report));
    assert.equal(await readFile('benchmark/results/v0.8.2.json', 'utf8'), formatBenchmarkJson(report));
    assert.equal(await readFile('benchmark/results/v0.8.2.md', 'utf8'), formatBenchmarkMarkdown(report));
    assert.match(report.fixtureSha256, /^[a-f0-9]{64}$/);
  });

  it('uses null for undefined ratios and gives NO_MEMORY no invented policy intelligence', () => {
    const report = runBenchmark();
    const noMemory = report.configurations.find((item) => item.configuration === 'NO_MEMORY')!;
    assert.equal(noMemory.aggregate.retrievalMicro.precision.value, null);
    assert.deepEqual(noMemory.aggregate.retrievalMicro.precision, { numerator: 0, denominator: 0, value: null });
    assert.deepEqual(noMemory.aggregate.authorityProblemDetection, { numerator: 0, denominator: 0, value: null });
    assert.deepEqual(noMemory.aggregate.freshnessProblemDetection, { numerator: 0, denominator: 0, value: null });
    assert.deepEqual(noMemory.aggregate.ownerEscalationCorrectness, { numerator: 0, denominator: 0, value: null });
    assert.match(report.methodology.noMemoryPolicy, /classifies nothing.*null/i);
  });

  it('publishes reproducible TP, FP, FN, selected, and relevant denominators', () => {
    for (const configuration of runBenchmark().configurations) {
      const retrieval = configuration.scenarios.map((scenario) => scenario.metrics.retrieval);
      const aggregate = configuration.aggregate.retrievalMicro;
      assert.equal(aggregate.truePositive, sum(retrieval.map((item) => item.truePositive)));
      assert.equal(aggregate.falsePositive, sum(retrieval.map((item) => item.falsePositive)));
      assert.equal(aggregate.falseNegative, sum(retrieval.map((item) => item.falseNegative)));
      assert.equal(aggregate.selectedCount, sum(retrieval.map((item) => item.selectedCount)));
      assert.equal(aggregate.relevantCount, sum(retrieval.map((item) => item.relevantCount)));
      assert.equal(aggregate.precision.denominator, aggregate.selectedCount);
      assert.equal(aggregate.recall.denominator, aggregate.relevantCount);
    }
  });

  it('keeps unsafe relevance explicit while using safety-adjusted recall ground truth', () => {
    const fixture = loadBenchmarkFixture().fixture;
    const conflicted = fixture.scenarios.find((item) => item.id === 'conflicted-memory')!;
    assert.deepEqual(conflicted.groundTruth.relevantIds, ['BM-003-A']);
    assert.deepEqual(conflicted.groundTruth.safeRelevantIds, []);
    assert.deepEqual(conflicted.groundTruth.unsafeIds, ['BM-003-A']);
    const doubtful = runBenchmark().configurations.find((item) => item.configuration === 'TAMHEES')!;
    assert.equal(doubtful.aggregate.unsafeExposureCount, 0);
    assert.equal(doubtful.aggregate.secretLeakageCount, 0);
    assert.equal(doubtful.aggregate.budgetCompliance.value, 1);
  });

  it('does not derive or modify fixture ground truth from production output', () => {
    const original = loadBenchmarkFixture().fixture;
    const changed = structuredClone(original) as unknown as {
      scenarios: Array<{
        groundTruth: {
          relevantIds: string[];
          safeRelevantIds: string[];
          expectedSelectedIds: string[];
          abstentionExpected: boolean;
        };
      }>;
    };
    changed.scenarios[0]!.groundTruth.relevantIds = [];
    changed.scenarios[0]!.groundTruth.safeRelevantIds = [];
    changed.scenarios[0]!.groundTruth.expectedSelectedIds = [];
    changed.scenarios[0]!.groundTruth.abstentionExpected = true;
    const before = runBenchmark(original).configurations[3]!.scenarios[0]!;
    const after = runBenchmark(changed as unknown as BenchmarkFixture).configurations[3]!.scenarios[0]!;
    assert.deepEqual(after.selectedIds, before.selectedIds);
    assert.notDeepEqual(after.metrics.retrieval, before.metrics.retrieval);
    assert.equal(after.metrics.outcomeCorrect, false);
  });

  it('rejects omission, duplication, reordering, and inconsistent ground-truth denominators', () => {
    const fixture = loadBenchmarkFixture().fixture;
    const omitted = structuredClone(fixture) as unknown as { scenarios: unknown[] };
    omitted.scenarios.pop();
    assert.throws(() => parseBenchmarkFixture(omitted), /incomplete/);

    const duplicated = structuredClone(fixture) as unknown as { scenarios: Array<Record<string, unknown>> };
    duplicated.scenarios[1] = structuredClone(duplicated.scenarios[0]!);
    assert.throws(() => parseBenchmarkFixture(duplicated), /ordering/);

    const reordered = structuredClone(fixture) as unknown as { scenarios: unknown[] };
    [reordered.scenarios[0], reordered.scenarios[1]] = [reordered.scenarios[1], reordered.scenarios[0]];
    assert.throws(() => parseBenchmarkFixture(reordered), /ordering/);

    const inconsistent = structuredClone(fixture) as unknown as {
      scenarios: Array<{ groundTruth: { safeRelevantIds: string[] } }>;
    };
    inconsistent.scenarios[0]!.groundTruth.safeRelevantIds = ['BM-001-B'];
    assert.throws(() => parseBenchmarkFixture(inconsistent), /inconsistent/);
  });

  it('detects manipulated committed results and renders transparent metric names', async () => {
    const report = runBenchmark();
    const canonical = formatBenchmarkJson(report);
    const manipulated = canonical.replace('"truePositive": 0', '"truePositive": 999');
    assert.notEqual(manipulated, canonical);
    assert.equal(await readFile('benchmark/results/v0.8.2.json', 'utf8'), canonical);
    const markdown = formatBenchmarkMarkdown(report);
    for (const marker of [
      'Micro precision', 'Micro recall', 'Authority prevention', 'Authority detection',
      'Freshness detection', 'Unsafe exposures', 'Owner escalation', 'Abstention', 'Exact outcome',
    ]) assert.match(markdown, new RegExp(marker));
  });
});

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
