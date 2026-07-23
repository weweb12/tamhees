import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  BENCHMARK_CONFIGURATIONS,
  type BenchmarkAggregate,
  type BenchmarkConfiguration,
  type BenchmarkReport,
} from '../benchmark/benchmark.js';

export const DASHBOARD_BENCHMARK_RELATIVE_PATH = 'benchmark/results/v0.7.0.json';
export const DASHBOARD_BENCHMARK_SHA256 =
  'aab7fc8a775d024256b7c6e53d19b426fed98702702a3b89b39bc6408a948eab';

export interface DashboardBenchmarkConfiguration {
  readonly name: BenchmarkConfiguration;
  readonly retrievalMicro: BenchmarkAggregate['retrievalMicro'];
  readonly authorityViolationPrevention: BenchmarkAggregate['authorityViolationPrevention'];
  readonly authorityProblemDetection: BenchmarkAggregate['authorityProblemDetection'];
  readonly freshnessProblemDetection: BenchmarkAggregate['freshnessProblemDetection'];
  readonly ownerEscalationCorrectness: BenchmarkAggregate['ownerEscalationCorrectness'];
  readonly abstentionCorrectness: BenchmarkAggregate['abstentionCorrectness'];
  readonly budgetCompliance: BenchmarkAggregate['budgetCompliance'];
  readonly outcomeCorrectness: BenchmarkAggregate['outcomeCorrectness'];
  readonly unsafeExposureCount: number;
  readonly secretLeakageCount: number;
}

export interface DashboardBenchmark {
  readonly benchmarkVersion: string;
  readonly engineVersion: string;
  readonly generatedAt: string;
  readonly deterministic: true;
  readonly artifactSha256: string;
  readonly fixtureSha256: string;
  readonly scenarioCount: number;
  readonly configurations: readonly DashboardBenchmarkConfiguration[];
  readonly methodology: {
    readonly groundTruthPolicy: string;
    readonly safetyAdjustedRecallPolicy: string;
    readonly undefinedMetricPolicy: string;
    readonly noMemoryPolicy: string;
  };
  readonly limitation: string;
}

export async function loadDashboardBenchmark(rootDir = process.cwd()): Promise<DashboardBenchmark> {
  const artifactPath = resolve(rootDir, DASHBOARD_BENCHMARK_RELATIVE_PATH);
  const bytes = await readFile(artifactPath);
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== DASHBOARD_BENCHMARK_SHA256) {
    throw new Error('Benchmark artifact integrity check failed.');
  }

  const parsed: unknown = JSON.parse(bytes.toString('utf8'));
  assertBenchmarkReport(parsed);
  return {
    benchmarkVersion: parsed.benchmarkVersion,
    engineVersion: parsed.engineVersion,
    generatedAt: parsed.generatedAt,
    deterministic: true,
    artifactSha256: hash,
    fixtureSha256: parsed.fixtureSha256,
    scenarioCount: parsed.methodology.scenarioCount,
    configurations: parsed.configurations.map((configuration) => ({
      name: configuration.configuration,
      retrievalMicro: configuration.aggregate.retrievalMicro,
      authorityViolationPrevention: configuration.aggregate.authorityViolationPrevention,
      authorityProblemDetection: configuration.aggregate.authorityProblemDetection,
      freshnessProblemDetection: configuration.aggregate.freshnessProblemDetection,
      ownerEscalationCorrectness: configuration.aggregate.ownerEscalationCorrectness,
      abstentionCorrectness: configuration.aggregate.abstentionCorrectness,
      budgetCompliance: configuration.aggregate.budgetCompliance,
      outcomeCorrectness: configuration.aggregate.outcomeCorrectness,
      unsafeExposureCount: configuration.aggregate.unsafeExposureCount,
      secretLeakageCount: configuration.aggregate.secretLeakageCount,
    })),
    methodology: {
      groundTruthPolicy: parsed.methodology.groundTruthPolicy,
      safetyAdjustedRecallPolicy: parsed.methodology.safetyAdjustedRecallPolicy,
      undefinedMetricPolicy: parsed.methodology.undefinedMetricPolicy,
      noMemoryPolicy: parsed.methodology.noMemoryPolicy,
    },
    limitation:
      'The two Doubtful Memory recall misses are safe relevant records excluded by the hard context budget.',
  };
}

function assertBenchmarkReport(value: unknown): asserts value is BenchmarkReport {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Benchmark artifact schema is invalid.');
  }
  const report = value as Partial<BenchmarkReport>;
  if (
    report.benchmarkVersion !== '2.0.0'
    || report.deterministic !== true
    || typeof report.engineVersion !== 'string'
    || typeof report.generatedAt !== 'string'
    || typeof report.fixtureSha256 !== 'string'
    || typeof report.methodology !== 'object'
    || report.methodology === null
    || !Array.isArray(report.configurations)
    || report.configurations.length !== BENCHMARK_CONFIGURATIONS.length
  ) {
    throw new Error('Benchmark artifact schema is invalid.');
  }
  for (let index = 0; index < BENCHMARK_CONFIGURATIONS.length; index += 1) {
    const configuration = report.configurations[index];
    if (
      configuration?.configuration !== BENCHMARK_CONFIGURATIONS[index]
      || typeof configuration.aggregate !== 'object'
      || configuration.aggregate === null
    ) {
      throw new Error('Benchmark artifact configuration order is invalid.');
    }
  }
}
