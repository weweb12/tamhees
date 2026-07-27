import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { atomicWriteText, verifyPathSafety } from '../core/atomic-write.js';
import { ENGINE_VERSION } from '../core/identity.js';
import { formatBenchmarkJson, formatBenchmarkMarkdown, runBenchmark } from './benchmark.js';

const root = resolve(process.cwd());
const directory = join(root, 'benchmark', 'results');
await mkdir(directory, { recursive: true });
const report = runBenchmark();

for (const [name, content] of [
  [`v${ENGINE_VERSION}.json`, formatBenchmarkJson(report)],
  [`v${ENGINE_VERSION}.md`, formatBenchmarkMarkdown(report)],
] as const) {
  const path = join(directory, name);
  const safety = await verifyPathSafety(path, root);
  if (!safety.safe) throw new Error('Benchmark output path is unsafe.');
  await atomicWriteText(path, content, { allowOverwrite: true });
}
process.stdout.write(formatBenchmarkMarkdown(report));
