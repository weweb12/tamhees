// Builds the hosted Tamhees demo as a static site in ./_site
//
//   npm run site            (runs `npm run build` first)
//   node scripts/build-static-site.mjs [outputDir]
//
// The static site reuses the local dashboard page unchanged and swaps the loopback
// server for web/hosted-api.js, which runs the compiled engine modules in the
// visitor's browser. Only the modules reachable from dist/src/dashboard/scenarios.js
// are shipped. Node built-ins are mapped to small browser stand-ins via an import map.
// No dependencies, no network access, no telemetry.

import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, process.argv[2] ?? '_site');
const distSrc = join(root, 'dist', 'src');
const entries = [join(distSrc, 'dashboard', 'scenarios.js'), join(distSrc, 'dashboard', 'inspector.js')];
const entry = entries[0];

const NODE_SHIMS = {
  'node:crypto': './shims/node-crypto.js',
  'node:fs/promises': './shims/node-fs-promises.js',
  'node:path': './shims/node-path.js',
};

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(entry))) {
  console.error('dist/ is missing. Run `npm run build` first (or use `npm run site`).');
  process.exit(1);
}

// 1. Collect the engine module graph reachable from the dashboard scenarios and inspector.
const IMPORT_PATTERN = /(?:^|\n)\s*(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;
const modules = new Set();
const pending = [...entries];
while (pending.length > 0) {
  const file = pending.pop();
  if (modules.has(file)) continue;
  modules.add(file);
  const source = await readFile(file, 'utf8');
  // Node-only globals have no browser equivalent unless a stand-in exists.
  // Buffer.byteLength is provided by web/shims/buffer-global.js; anything else must fail the build.
  const nodeGlobals = source
    .replace(/Buffer\.byteLength\(/g, '')
    .match(/\b(?:Buffer\.|process\.|require\(|__dirname\b|__filename\b|setImmediate\()/g);
  if (nodeGlobals !== null) {
    throw new Error(`${relative(root, file)} uses Node-only global(s): ${[...new Set(nodeGlobals)].join(', ')}`);
  }
  // Every name imported from a Node built-in must be exported by its browser stand-in,
  // otherwise the browser fails to link the module at runtime.
  for (const named of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"](node:[^'"]+)['"]/g)) {
    const shim = NODE_SHIMS[named[2]];
    if (shim === undefined) continue;
    const shimSource = await readFile(join(root, 'web', shim), 'utf8');
    for (const name of named[1].split(',').map((part) => part.trim().split(/\s+as\s+/)[0]).filter(Boolean)) {
      if (!new RegExp(`export\\s+(?:async\\s+)?(?:const|let|function|class)\\s+${name}\\b`).test(shimSource)) {
        throw new Error(`Browser stand-in ${shim} does not export "${name}" needed by ${relative(root, file)}`);
      }
    }
  }
  for (const match of source.matchAll(IMPORT_PATTERN)) {
    const specifier = match[1] ?? match[2];
    if (specifier.startsWith('.')) {
      const target = resolve(dirname(file), specifier);
      if (!(await exists(target))) throw new Error(`Unresolved import ${specifier} in ${file}`);
      pending.push(target);
    } else if (!(specifier in NODE_SHIMS)) {
      throw new Error(`No browser stand-in for "${specifier}" imported by ${relative(root, file)}`);
    }
  }
}

// 2. Fresh output directory.
await rm(out, { recursive: true, force: true });
await mkdir(join(out, 'assets'), { recursive: true });
await mkdir(join(out, 'data'), { recursive: true });

for (const file of [...modules].sort()) {
  const target = join(out, 'engine', relative(distSrc, file));
  await mkdir(dirname(target), { recursive: true });
  await cp(file, target);
}
await cp(join(root, 'web', 'shims'), join(out, 'shims'), { recursive: true });
await cp(join(root, 'web', 'hosted-api.js'), join(out, 'hosted-api.js'));
await cp(join(root, 'web', 'hosted.css'), join(out, 'assets', 'hosted.css'));
for (const asset of ['dashboard.css', 'dashboard.js']) {
  await cp(join(root, 'src', 'dashboard', 'public', asset), join(out, 'assets', asset));
}

// 3. Benchmark data, produced by the same integrity-checked loader the local server uses.
const { loadDashboardBenchmark } = await import(
  pathToFileURL(join(distSrc, 'dashboard', 'benchmark.js')).href
);
const benchmark = await loadDashboardBenchmark(root);
await writeFile(
  join(out, 'data', 'benchmark.json'),
  // Same bytes as the loopback server's sendJson(): compact JSON plus a trailing newline.
  `${JSON.stringify({ schemaVersion: '1.0.0', benchmark })}\n`,
);

// 4. Page: same markup as the local dashboard, with relative asset paths and the
//    hosted adapter loaded (in document order) before dashboard.js.
const importMap = JSON.stringify({ imports: NODE_SHIMS });
const importMapHash = createHash('sha256').update(importMap, 'utf8').digest('base64');
const csp = [
  "default-src 'none'",
  `script-src 'self' 'sha256-${importMapHash}'`,
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "font-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

let html = await readFile(join(root, 'src', 'dashboard', 'public', 'index.html'), 'utf8');
const replacements = [
  [
    '<link rel="stylesheet" href="/assets/dashboard.css">',
    '<meta http-equiv="Content-Security-Policy" content="' + csp + '">\n'
      + '  <link rel="stylesheet" href="assets/dashboard.css">\n'
      + '  <link rel="stylesheet" href="assets/hosted.css">',
  ],
  [
    '<script src="/assets/dashboard.js" defer></script>',
    `<script type="importmap">${importMap}</script>\n`
      + '  <script type="module" src="hosted-api.js"></script>\n'
      + '  <script src="assets/dashboard.js" defer></script>',
  ],
];
for (const [from, to] of replacements) {
  if (!html.includes(from)) throw new Error(`index.html no longer contains: ${from}`);
  html = html.replace(from, to);
}
await writeFile(join(out, 'index.html'), html);
await writeFile(join(out, '.nojekyll'), '');

console.log(`Static demo written to ${relative(root, out) || '.'} (${modules.size} engine modules).`);
