/**
 * Tamhees — repository observation ("memory that notices it might be wrong").
 *
 * Until now Tamhees only knew a memory was contradicted when an agent supplied
 * CONTRADICTS evidence. The observer lets the engine check some claims itself,
 * deterministically and locally:
 *
 *   1. Technology claims   "The project uses SQLite"   vs dependencies, lockfiles, config
 *   2. Script claims       "Run npm run build:legacy"  vs package.json scripts
 *   3. Path claims         "Handler is in src/pay.ts"  vs the file actually existing
 *
 * Safety and honesty rules:
 *   - Reads only a fixed allowlist of manifest/config files at known paths. Never reads
 *     .env files, keys or arbitrary source. Symlinks are not followed. 1 MiB size cap.
 *   - Path claims only check existence; file contents are never read.
 *   - A technology claim is contradicted only when the claimed technology is absent AND
 *     a competing technology in the same group is present. Absence alone proves nothing.
 *   - Statements with negation or change language ("no longer", "migrated from") and
 *     statements naming several technologies of one group are skipped, not guessed.
 *   - SENSITIVE/SECRET, forgotten, revoked and RESTRICTED-scope memories are skipped.
 *   - Evidence IDs are content-derived, so re-running records nothing new unless the
 *     repository changed. Evidence goes through the normal validated evidence store.
 */

import { createHash } from 'node:crypto';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { verifyPathSafety } from './atomic-write.js';
import { normalizeLegacyMemory } from './scope.js';
import {
  CURRENT_SCHEMA_VERSION,
  type Clock,
  type EvidenceRecord,
  type EvidenceRelationship,
  type MemoryRecord,
} from './types.js';

export const OBSERVER_ID = 'tamhees-observe';
const MAX_MANIFEST_BYTES = 1024 * 1024;

// ─── Technology catalog ─────────────────────────────────────────────────────

interface Technology {
  readonly id: string;
  readonly label: string;
  readonly group: string;
  /** Words that name it in a statement. Ambiguous English words are tag-only. */
  readonly aliases: readonly string[];
  /** Matches only when used as a tag (e.g. "express", "next"). */
  readonly tagAliases?: readonly string[];
  readonly deps?: readonly string[];
  readonly depPrefixes?: readonly string[];
  readonly pyDeps?: readonly string[];
  readonly files?: readonly string[];
  readonly prisma?: readonly string[];
  readonly images?: readonly string[];
  readonly lockfiles?: readonly string[];
  readonly packageManager?: string;
  /** Presence of this technology also means these are present (Supabase is Postgres). */
  readonly implies?: readonly string[];
}

export const TECHNOLOGIES: readonly Technology[] = [
  // Databases
  { id: 'sqlite', label: 'SQLite', group: 'database', aliases: ['sqlite', 'sqlite3'], deps: ['sqlite3', 'better-sqlite3', 'sqlite', '@libsql/client'], prisma: ['sqlite'], pyDeps: ['aiosqlite'], files: ['db.sqlite3'] },
  { id: 'postgres', label: 'PostgreSQL', group: 'database', aliases: ['postgres', 'postgresql', 'psql'], deps: ['pg', 'postgres', 'pg-promise', '@neondatabase/serverless', '@vercel/postgres'], prisma: ['postgresql', 'postgres'], images: ['postgres'], pyDeps: ['psycopg2', 'psycopg2-binary', 'psycopg', 'asyncpg'] },
  { id: 'mysql', label: 'MySQL', group: 'database', aliases: ['mysql', 'mariadb'], deps: ['mysql', 'mysql2', 'mariadb'], prisma: ['mysql'], images: ['mysql', 'mariadb'], pyDeps: ['mysqlclient', 'pymysql'] },
  { id: 'mongodb', label: 'MongoDB', group: 'database', aliases: ['mongodb', 'mongo'], deps: ['mongodb', 'mongoose'], prisma: ['mongodb'], images: ['mongo'], pyDeps: ['pymongo', 'motor'] },
  { id: 'supabase', label: 'Supabase', group: 'database', aliases: ['supabase'], depPrefixes: ['@supabase/'], files: ['supabase/config.toml'], pyDeps: ['supabase'], implies: ['postgres'] },
  { id: 'firebase', label: 'Firebase', group: 'database', aliases: ['firebase', 'firestore'], deps: ['firebase', 'firebase-admin'], files: ['firebase.json'], pyDeps: ['firebase-admin'] },
  // ORMs
  { id: 'prisma', label: 'Prisma', group: 'orm', aliases: ['prisma'], deps: ['prisma', '@prisma/client'], files: ['prisma/schema.prisma'] },
  { id: 'drizzle', label: 'Drizzle', group: 'orm', aliases: ['drizzle'], deps: ['drizzle-orm'] },
  { id: 'typeorm', label: 'TypeORM', group: 'orm', aliases: ['typeorm'], deps: ['typeorm'] },
  { id: 'sequelize', label: 'Sequelize', group: 'orm', aliases: ['sequelize'], deps: ['sequelize'] },
  { id: 'sqlalchemy', label: 'SQLAlchemy', group: 'orm', aliases: ['sqlalchemy'], pyDeps: ['sqlalchemy'] },
  // Package managers
  { id: 'npm', label: 'npm', group: 'package-manager', aliases: ['npm'], lockfiles: ['package-lock.json'], packageManager: 'npm' },
  { id: 'yarn', label: 'Yarn', group: 'package-manager', aliases: ['yarn'], lockfiles: ['yarn.lock'], packageManager: 'yarn' },
  { id: 'pnpm', label: 'pnpm', group: 'package-manager', aliases: ['pnpm'], lockfiles: ['pnpm-lock.yaml'], files: ['pnpm-workspace.yaml'], packageManager: 'pnpm' },
  { id: 'bun', label: 'Bun', group: 'package-manager', aliases: [], tagAliases: ['bun'], lockfiles: ['bun.lockb', 'bun.lock'], packageManager: 'bun' },
  // Test frameworks
  { id: 'jest', label: 'Jest', group: 'test-framework', aliases: ['jest'], deps: ['jest'] },
  { id: 'vitest', label: 'Vitest', group: 'test-framework', aliases: ['vitest'], deps: ['vitest'] },
  { id: 'mocha', label: 'Mocha', group: 'test-framework', aliases: ['mocha'], deps: ['mocha'] },
  { id: 'jasmine', label: 'Jasmine', group: 'test-framework', aliases: ['jasmine'], deps: ['jasmine'] },
  { id: 'pytest', label: 'pytest', group: 'test-framework', aliases: ['pytest'], pyDeps: ['pytest'] },
  // End-to-end testing
  { id: 'playwright', label: 'Playwright', group: 'e2e', aliases: ['playwright'], deps: ['@playwright/test', 'playwright'] },
  { id: 'cypress', label: 'Cypress', group: 'e2e', aliases: ['cypress'], deps: ['cypress'] },
  // UI frameworks
  { id: 'react', label: 'React', group: 'ui-framework', aliases: ['react', 'reactjs'], deps: ['react'] },
  { id: 'vue', label: 'Vue', group: 'ui-framework', aliases: ['vue', 'vuejs', 'vue.js'], deps: ['vue'] },
  { id: 'svelte', label: 'Svelte', group: 'ui-framework', aliases: ['svelte'], deps: ['svelte'] },
  { id: 'angular', label: 'Angular', group: 'ui-framework', aliases: ['angular'], deps: ['@angular/core'] },
  { id: 'preact', label: 'Preact', group: 'ui-framework', aliases: ['preact'], deps: ['preact'] },
  { id: 'solid', label: 'Solid', group: 'ui-framework', aliases: ['solidjs', 'solid-js'], tagAliases: ['solid'], deps: ['solid-js'] },
  // App frameworks
  { id: 'nextjs', label: 'Next.js', group: 'app-framework', aliases: ['next.js', 'nextjs'], tagAliases: ['next'], deps: ['next'], files: ['next.config.js', 'next.config.mjs', 'next.config.ts'], implies: ['react'] },
  { id: 'nuxt', label: 'Nuxt', group: 'app-framework', aliases: ['nuxt', 'nuxtjs'], deps: ['nuxt'], implies: ['vue'] },
  { id: 'sveltekit', label: 'SvelteKit', group: 'app-framework', aliases: ['sveltekit'], deps: ['@sveltejs/kit'], implies: ['svelte'] },
  { id: 'remix', label: 'Remix', group: 'app-framework', aliases: ['remix.run'], tagAliases: ['remix'], depPrefixes: ['@remix-run/'], implies: ['react'] },
  { id: 'astro', label: 'Astro', group: 'app-framework', aliases: ['astro'], deps: ['astro'] },
  // Bundlers
  { id: 'vite', label: 'Vite', group: 'bundler', aliases: ['vite'], deps: ['vite'], files: ['vite.config.ts', 'vite.config.js', 'vite.config.mjs'] },
  { id: 'webpack', label: 'webpack', group: 'bundler', aliases: ['webpack'], deps: ['webpack'], files: ['webpack.config.js'] },
  { id: 'parcel', label: 'Parcel', group: 'bundler', aliases: ['parcel'], deps: ['parcel'] },
  { id: 'rollup', label: 'Rollup', group: 'bundler', aliases: ['rollup'], deps: ['rollup'] },
  // Styling
  { id: 'tailwind', label: 'Tailwind CSS', group: 'styling', aliases: ['tailwind', 'tailwindcss'], deps: ['tailwindcss'], files: ['tailwind.config.js', 'tailwind.config.ts'] },
  { id: 'bootstrap', label: 'Bootstrap', group: 'styling', aliases: ['bootstrap'], deps: ['bootstrap'] },
  { id: 'styled-components', label: 'styled-components', group: 'styling', aliases: ['styled-components'], deps: ['styled-components'] },
  { id: 'sass', label: 'Sass', group: 'styling', aliases: ['sass', 'scss'], deps: ['sass', 'node-sass'] },
  // Servers
  { id: 'express', label: 'Express', group: 'http-server', aliases: ['express.js', 'expressjs'], tagAliases: ['express'], deps: ['express'] },
  { id: 'fastify', label: 'Fastify', group: 'http-server', aliases: ['fastify'], deps: ['fastify'] },
  { id: 'koa', label: 'Koa', group: 'http-server', aliases: ['koa'], deps: ['koa'] },
  { id: 'hono', label: 'Hono', group: 'http-server', aliases: ['hono'], deps: ['hono'] },
  { id: 'nestjs', label: 'NestJS', group: 'http-server', aliases: ['nestjs'], deps: ['@nestjs/core'] },
  { id: 'django', label: 'Django', group: 'http-server', aliases: ['django'], pyDeps: ['django'], files: ['manage.py'] },
  { id: 'flask', label: 'Flask', group: 'http-server', aliases: ['flask'], pyDeps: ['flask'] },
  { id: 'fastapi', label: 'FastAPI', group: 'http-server', aliases: ['fastapi'], pyDeps: ['fastapi'] },
  // Python ORM built on SQLAlchemy
  { id: 'sqlmodel', label: 'SQLModel', group: 'orm', aliases: ['sqlmodel'], pyDeps: ['sqlmodel'], implies: ['sqlalchemy'] },
  // Containers (single member: supported only)
  { id: 'docker', label: 'Docker', group: 'container', aliases: ['docker', 'dockerfile', 'docker-compose'], files: ['Dockerfile', 'docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml', '.dockerignore'] },
  // Monorepo tools
  { id: 'turborepo', label: 'Turborepo', group: 'monorepo-tool', aliases: ['turborepo'], tagAliases: ['turbo'], deps: ['turbo'], files: ['turbo.json'] },
  { id: 'nx', label: 'Nx', group: 'monorepo-tool', aliases: ['nx'], deps: ['nx'], files: ['nx.json'] },
  { id: 'lerna', label: 'Lerna', group: 'monorepo-tool', aliases: ['lerna'], deps: ['lerna'], files: ['lerna.json'] },
  // Documentation sites
  { id: 'vitepress', label: 'VitePress', group: 'docs-site', aliases: ['vitepress'], deps: ['vitepress'] },
  { id: 'docusaurus', label: 'Docusaurus', group: 'docs-site', aliases: ['docusaurus'], deps: ['@docusaurus/core'] },
  { id: 'mkdocs', label: 'MkDocs', group: 'docs-site', aliases: ['mkdocs'], pyDeps: ['mkdocs', 'mkdocs-material'], files: ['mkdocs.yml'] },
  // Caches
  { id: 'redis', label: 'Redis', group: 'cache', aliases: ['redis'], deps: ['redis', 'ioredis', '@upstash/redis'], pyDeps: ['redis'], images: ['redis'] },
  { id: 'memcached', label: 'Memcached', group: 'cache', aliases: ['memcached'], deps: ['memcached'], images: ['memcached'] },
  // Client state management
  { id: 'redux', label: 'Redux', group: 'state-management', aliases: ['redux'], deps: ['redux', '@reduxjs/toolkit'] },
  { id: 'zustand', label: 'Zustand', group: 'state-management', aliases: ['zustand'], deps: ['zustand'] },
  { id: 'mobx', label: 'MobX', group: 'state-management', aliases: ['mobx'], deps: ['mobx'] },
  { id: 'pinia', label: 'Pinia', group: 'state-management', aliases: ['pinia'], deps: ['pinia'] },
  { id: 'jotai', label: 'Jotai', group: 'state-management', aliases: ['jotai'], deps: ['jotai'] },
  // Language (single member: can only be supported, never contradicted)
  { id: 'typescript', label: 'TypeScript', group: 'language', aliases: ['typescript'], deps: ['typescript'], files: ['tsconfig.json'] },
];

const TECH_BY_ID = new Map(TECHNOLOGIES.map((tech) => [tech.id, tech]));

// Fixed allowlist. Nothing else in the repository is read.
const KNOWN_FILES = [
  ...new Set([
    ...TECHNOLOGIES.flatMap((tech) => [...(tech.files ?? []), ...(tech.lockfiles ?? [])]),
    'package.json', 'requirements.txt', 'requirements-dev.txt', 'pyproject.toml',
    'docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml',
  ]),
].sort();

const NEGATION = /\b(?:not|never|no longer|don't|do not|doesn't|does not|isn't|is not|avoid|instead of|replac(?:e|ed|es|ing)|migrat(?:e|ed|es|ing)|remov(?:e|ed|es|ing)|deprecat(?:e|ed|es|ing)|without|stopped|switch(?:ed)? from|mov(?:e|ed) (?:away )?from|formerly|previously|used to|no more)\b/i;

const RUNNER_BUILTINS = new Set([
  'add', 'audit', 'cache', 'config', 'create', 'dedupe', 'dlx', 'exec', 'global', 'import', 'info',
  'init', 'install', 'link', 'list', 'login', 'logout', 'ls', 'outdated', 'pack', 'patch', 'plugin',
  'publish', 'rebuild', 'remove', 'run', 'set', 'store', 'unlink', 'up', 'update', 'upgrade', 'version',
  'why', 'workspace', 'workspaces', 'i', 'ci', 'x',
]);

// ─── Repository facts ───────────────────────────────────────────────────────

export interface RepositoryFacts {
  /** Allowlisted files that exist, as project-relative paths (root and workspace folders). */
  readonly files: ReadonlySet<string>;
  /** Node dependency name → manifest file (project-relative). */
  readonly dependencies: ReadonlyMap<string, string>;
  /** Python dependency name (lowercased) → manifest file (project-relative). */
  readonly pyDependencies: ReadonlyMap<string, string>;
  /** Union of package.json scripts across all manifests, or null when there is none. */
  readonly scripts: ReadonlySet<string> | null;
  readonly packageManager: string | null;
  readonly prismaProvider: string | null;
  readonly composeImages: ReadonlySet<string>;
  /** Names declared by the project's own package.json files → manifest (a library's own repo). */
  readonly packageNames?: ReadonlyMap<string, string>;
  /** Scripts per package.json, for path-scoped checks. */
  readonly scriptsByManifest?: ReadonlyMap<string, ReadonlySet<string>>;
  /** Where the Prisma provider came from. */
  readonly prismaSchemaPath?: string | null;
}

/** Folders never searched for workspace manifests: generated output, vendored code, fixtures. */
const SKIPPED_DIRECTORIES = new Set([
  'node_modules', 'dist', 'build', 'out', 'coverage', 'vendor', 'target', 'venv', 'env',
  '__pycache__', 'fixtures', '__fixtures__', 'playground', 'playgrounds', 'examples', 'example',
  'samples', 'templates', 'template', 'test', 'tests', '__tests__', 'e2e', 'tmp', 'temp',
]);
const MAX_WORKSPACE_DEPTH = 3;
const MAX_WORKSPACE_DIRECTORIES = 2_000;
const MAX_MANIFEST_DIRECTORIES = 200;
const MANIFEST_FILES = ['package.json', 'pyproject.toml', 'requirements.txt', 'requirements-dev.txt'] as const;

async function readSafeText(root: string, relativePath: string): Promise<string | null> {
  const target = join(root, relativePath);
  const safety = await verifyPathSafety(target, root);
  if (!safety.safe) return null;
  try {
    const stats = await lstat(target);
    if (!stats.isFile() || stats.size > MAX_MANIFEST_BYTES) return null;
    return await readFile(target, 'utf8');
  } catch {
    return null;
  }
}

export async function existsSafely(root: string, relativePath: string): Promise<boolean> {
  const target = join(root, relativePath);
  const safety = await verifyPathSafety(target, root);
  if (!safety.safe) return false;
  try {
    await lstat(target);
    return true;
  } catch {
    return false;
  }
}

function pythonRequirementName(line: string): string | null {
  const trimmed = line.replace(/#.*/, '').trim();
  if (trimmed === '' || trimmed.startsWith('-')) return null;
  const match = /^([A-Za-z0-9][A-Za-z0-9._-]*)/.exec(trimmed);
  return match ? match[1]!.toLowerCase().replace(/_/g, '-') : null;
}

/** Quoted strings inside every `key = [ ... ]` array, honouring quotes (extras use brackets). */
function tomlStringArrays(text: string): string[] {
  const values: string[] = [];
  for (const start of text.matchAll(/^\s*[A-Za-z0-9_.-]+\s*=\s*\[/gm)) {
    let index = (start.index ?? 0) + start[0].length;
    let quote: string | null = null;
    let current = '';
    for (; index < text.length; index += 1) {
      const char = text[index]!;
      if (quote !== null) {
        if (char === quote) {
          values.push(current);
          current = '';
          quote = null;
        } else {
          current += char;
        }
      } else if (char === '"' || char === "'") {
        quote = char;
      } else if (char === '#') {
        const lineEnd = text.indexOf('\n', index);
        index = lineEnd < 0 ? text.length : lineEnd;
      } else if (char === ']') {
        break;
      }
    }
  }
  return values;
}

function pyprojectDependencies(text: string): string[] {
  const names: string[] = [];
  // PEP 621 / PEP 735: dependencies = ["fastapi[standard]>=0.1", ...], dev = [...]
  for (const item of tomlStringArrays(text)) {
    const name = pythonRequirementName(item);
    if (name) names.push(name);
  }
  // Poetry: [tool.poetry.dependencies] / [tool.poetry.group.*.dependencies] tables
  for (const table of text.matchAll(/^\[tool\.poetry\.(?:group\.[^.\]]+\.)?(?:dev-)?dependencies\]\s*$([\s\S]*?)(?=^\[|$(?![\s\S]))/gm)) {
    for (const line of table[1]!.split('\n')) {
      const match = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*=/.exec(line);
      if (match && match[1]!.toLowerCase() !== 'python') names.push(match[1]!.toLowerCase().replace(/_/g, '-'));
    }
  }
  return names;
}

/** Folders (project-relative, '' for the root) that contain a package or Python manifest. */
async function findManifestDirectories(root: string): Promise<string[]> {
  const found: string[] = [''];
  let visited = 0;
  async function walk(relative: string, depth: number): Promise<void> {
    if (depth > MAX_WORKSPACE_DEPTH || visited >= MAX_WORKSPACE_DIRECTORIES || found.length >= MAX_MANIFEST_DIRECTORIES) return;
    let entries: import('node:fs').Dirent[];
    try {
      entries = await readdir(relative === '' ? root : join(root, relative), { withFileTypes: true });
    } catch {
      return;
    }
    visited += 1;
    if (relative !== '' && entries.some((entry) => entry.isFile() && (MANIFEST_FILES as readonly string[]).includes(entry.name))) {
      found.push(relative);
    }
    const children = entries
      .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink()
        && !entry.name.startsWith('.') && !SKIPPED_DIRECTORIES.has(entry.name.toLowerCase())
        // Starter templates and samples (create-vite/template-react, example-app, ...).
        && !/^(?:template|example|fixture|sample)s?[-_]/i.test(entry.name))
      .map((entry) => entry.name)
      .sort();
    for (const child of children) await walk(relative === '' ? child : `${relative}/${child}`, depth + 1);
  }
  await walk('', 0);
  return found;
}

function inDirectory(directory: string, file: string): string {
  return directory === '' ? file : `${directory}/${file}`;
}

export async function collectRepositoryFacts(projectDir: string): Promise<RepositoryFacts> {
  const root = resolve(projectDir);
  const files = new Set<string>();
  const dependencies = new Map<string, string>();
  const pyDependencies = new Map<string, string>();
  const packageNames = new Map<string, string>();
  const scriptsByManifest = new Map<string, ReadonlySet<string>>();
  let packageManager: string | null = null;
  let prismaProvider: string | null = null;
  let prismaSchemaPath: string | null = null;

  for (const directory of await findManifestDirectories(root)) {
    for (const file of KNOWN_FILES) {
      const relativePath = inDirectory(directory, file);
      if (await existsSafely(root, relativePath)) files.add(relativePath);
    }

    const packagePath = inDirectory(directory, 'package.json');
    if (files.has(packagePath)) {
      try {
        const pkg = JSON.parse((await readSafeText(root, packagePath)) ?? 'null') as Record<string, unknown> | null;
        if (pkg && typeof pkg === 'object') {
          for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
            const block = pkg[field];
            if (block && typeof block === 'object' && !Array.isArray(block)) {
              for (const name of Object.keys(block)) if (!dependencies.has(name)) dependencies.set(name, packagePath);
            }
          }
          if (typeof pkg['name'] === 'string' && pkg['name'] !== '') packageNames.set(pkg['name'], packagePath);
          scriptsByManifest.set(packagePath, new Set(
            pkg['scripts'] && typeof pkg['scripts'] === 'object' && !Array.isArray(pkg['scripts'])
              ? Object.keys(pkg['scripts'] as object)
              : [],
          ));
          if (directory === '' && typeof pkg['packageManager'] === 'string') {
            packageManager = /^([a-z]+)@?/.exec(pkg['packageManager'])?.[1] ?? null;
          }
        }
      } catch {
        // Malformed package.json: observe nothing from it.
      }
    }

    for (const file of ['requirements.txt', 'requirements-dev.txt']) {
      const relativePath = inDirectory(directory, file);
      if (!files.has(relativePath)) continue;
      for (const line of ((await readSafeText(root, relativePath)) ?? '').split('\n')) {
        const name = pythonRequirementName(line);
        if (name && !pyDependencies.has(name)) pyDependencies.set(name, relativePath);
      }
    }
    const pyprojectPath = inDirectory(directory, 'pyproject.toml');
    if (files.has(pyprojectPath)) {
      for (const name of pyprojectDependencies((await readSafeText(root, pyprojectPath)) ?? '')) {
        if (!pyDependencies.has(name)) pyDependencies.set(name, pyprojectPath);
      }
    }

    const schemaPath = inDirectory(directory, 'prisma/schema.prisma');
    if (prismaProvider === null && files.has(schemaPath)) {
      const schema = (await readSafeText(root, schemaPath)) ?? '';
      const datasource = /datasource\s+\w+\s*\{([\s\S]*?)\}/.exec(schema)?.[1] ?? '';
      prismaProvider = /provider\s*=\s*"([a-z]+)"/.exec(datasource)?.[1] ?? null;
      prismaSchemaPath = prismaProvider === null ? null : schemaPath;
    }
  }

  const composeImages = new Set<string>();
  for (const file of ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml']) {
    if (!files.has(file)) continue;
    for (const match of ((await readSafeText(root, file)) ?? '').matchAll(/^\s*image:\s*["']?([a-z0-9._/-]+)/gm)) {
      const image = match[1]!.split('/').pop()!.split(':')[0]!;
      composeImages.add(image);
    }
  }

  const scripts = scriptsByManifest.size === 0
    ? null
    : new Set([...scriptsByManifest.values()].flatMap((set) => [...set]));
  return { files, dependencies, pyDependencies, scripts, packageManager, prismaProvider, composeImages, packageNames, scriptsByManifest, prismaSchemaPath };
}

/**
 * Facts that apply to one project path (a RESTRICTED memory scoped to `path`): manifests
 * and config inside that folder, plus repository-wide package-manager signals.
 */
export function factsForPath(facts: RepositoryFacts, path: string): RepositoryFacts {
  const prefix = `${path.replace(/\/+$/, '')}/`;
  const within = (file: string) => file.startsWith(prefix);
  const rootLockfiles = new Set(TECHNOLOGIES.flatMap((tech) => tech.lockfiles ?? []));
  const filterMap = (map: ReadonlyMap<string, string> | undefined) => new Map([...(map ?? new Map<string, string>())].filter(([, file]) => within(file)));
  const scriptsByManifest = new Map([...(facts.scriptsByManifest ?? new Map<string, ReadonlySet<string>>())].filter(([file]) => within(file)));
  return {
    files: new Set([...facts.files].filter((file) => within(file) || rootLockfiles.has(file))),
    dependencies: filterMap(facts.dependencies),
    pyDependencies: filterMap(facts.pyDependencies),
    packageNames: filterMap(facts.packageNames),
    scriptsByManifest,
    scripts: scriptsByManifest.size === 0 ? null : new Set([...scriptsByManifest.values()].flatMap((set) => [...set])),
    packageManager: facts.packageManager,
    prismaProvider: facts.prismaSchemaPath && within(facts.prismaSchemaPath) ? facts.prismaProvider : null,
    prismaSchemaPath: facts.prismaSchemaPath && within(facts.prismaSchemaPath) ? facts.prismaSchemaPath : null,
    composeImages: facts.composeImages,
  };
}

/** Signals that show a technology is present, e.g. ["package.json: @supabase/supabase-js"]. */
function directSignals(tech: Technology, facts: RepositoryFacts): string[] {
  const signals: string[] = [];
  for (const dep of tech.deps ?? []) {
    const file = facts.dependencies.get(dep);
    if (file) signals.push(`${file}: ${dep}`);
  }
  for (const prefix of tech.depPrefixes ?? []) {
    for (const [dep, file] of facts.dependencies) if (dep.startsWith(prefix)) signals.push(`${file}: ${dep}`);
  }
  for (const dep of tech.pyDeps ?? []) {
    const file = facts.pyDependencies.get(dep);
    if (file) signals.push(`${file}: ${dep}`);
  }
  for (const file of [...(tech.files ?? []), ...(tech.lockfiles ?? [])]) {
    for (const present of facts.files) if (present === file || present.endsWith(`/${file}`)) signals.push(present);
  }
  // The repository of a library itself ("Express is the framework" inside express/).
  for (const [name, manifest] of facts.packageNames ?? new Map<string, string>()) {
    if ((tech.deps ?? []).includes(name) || (tech.depPrefixes ?? []).some((prefix) => name.startsWith(prefix))) {
      signals.push(`${manifest}: name ${name}`);
    }
  }
  if (tech.prisma && facts.prismaProvider && tech.prisma.includes(facts.prismaProvider)) {
    signals.push(`${facts.prismaSchemaPath ?? 'prisma/schema.prisma'}: provider "${facts.prismaProvider}"`);
  }
  for (const image of tech.images ?? []) {
    if (facts.composeImages.has(image)) signals.push(`compose image: ${image}`);
  }
  if (tech.packageManager && facts.packageManager === tech.packageManager) {
    signals.push(`package.json: packageManager ${tech.packageManager}`);
  }
  return [...new Set(signals)].sort();
}

/** Present technologies with their signals, including implied ones (Supabase ⇒ Postgres). */
export function presentTechnologies(facts: RepositoryFacts): ReadonlyMap<string, readonly string[]> {
  const present = new Map<string, string[]>();
  for (const tech of TECHNOLOGIES) {
    const signals = directSignals(tech, facts);
    if (signals.length > 0) present.set(tech.id, signals);
  }
  for (const [id, signals] of [...present]) {
    for (const implied of TECH_BY_ID.get(id)?.implies ?? []) {
      const existing = present.get(implied) ?? [];
      present.set(implied, [...new Set([...existing, ...signals.map((signal) => `${signal} (implies ${TECH_BY_ID.get(implied)!.label})`)])].sort());
    }
  }
  return present;
}

// ─── Claim extraction ───────────────────────────────────────────────────────

function tokens(text: string): string[] {
  return text.normalize('NFKC').toLowerCase().split(/[^a-z0-9.+#@/_-]+/).map((token) => token.replace(/[.,;:]+$/, '')).filter(Boolean);
}

export function mentionedTechnologies(record: MemoryRecord): Technology[] {
  const words = new Set(tokens(record.statement));
  const tags = new Set(record.tags.map((tag) => tag.normalize('NFKC').toLowerCase()));
  return TECHNOLOGIES.filter((tech) =>
    tech.aliases.some((alias) => words.has(alias) || tags.has(alias))
    || (tech.tagAliases ?? []).some((alias) => tags.has(alias))
    || tags.has(tech.id));
}

const SCRIPT_PATTERN = /\b(?:npm run|pnpm(?: run)?|yarn(?: run)?|bun run)\s+([a-z0-9][a-z0-9:_.-]*)/gi;
export function mentionedScripts(statement: string): string[] {
  const names = new Set<string>();
  for (const match of statement.matchAll(SCRIPT_PATTERN)) {
    const name = match[1]!.toLowerCase().replace(/[.:]+$/, '');
    if (name !== '' && !RUNNER_BUILTINS.has(name)) names.add(name);
  }
  return [...names].sort();
}

const PATH_PATTERN = /(?:^|[\s`'"(])((?:[A-Za-z0-9_][A-Za-z0-9_.-]*\/)+[A-Za-z0-9_][A-Za-z0-9_.-]*\.[A-Za-z0-9]{1,8})(?=$|[\s`'"),;:]|\.(?:\s|$))/g;
export function mentionedPaths(statement: string): string[] {
  const paths = new Set<string>();
  for (const match of statement.matchAll(PATH_PATTERN)) {
    const path = match[1]!;
    if (path.length <= 256 && !path.split('/').some((part) => part === '.' || part === '..')) paths.add(path);
  }
  return [...paths].sort();
}

// ─── Observation ────────────────────────────────────────────────────────────

export type ObservationKind = 'technology' | 'script' | 'path';

export interface Observation {
  readonly memoryId: string;
  readonly kind: ObservationKind;
  readonly subject: string;
  readonly relationship: Extract<EvidenceRelationship, 'SUPPORTS' | 'CONTRADICTS'>;
  readonly explanation: string;
  readonly sources: readonly string[];
  readonly evidenceId: string;
}

export interface SkippedClaim {
  readonly memoryId: string;
  readonly reason: string;
}

export interface ObservationReport {
  readonly observedAt: string;
  readonly filesRead: readonly string[];
  readonly memoriesChecked: number;
  readonly observations: readonly Observation[];
  readonly unverifiable: readonly SkippedClaim[];
  readonly skipped: readonly SkippedClaim[];
}

function evidenceIdFor(memoryId: string, kind: ObservationKind, subject: string, relationship: string, sources: readonly string[]): string {
  const digest = createHash('sha256')
    .update([memoryId, kind, subject, relationship, ...sources].join('\u0000'), 'utf8')
    .digest('hex')
    .slice(0, 16)
    .toUpperCase();
  return `DM-EVIDENCE-OBS-${digest}`;
}

function observation(
  memoryId: string,
  kind: ObservationKind,
  subject: string,
  relationship: Observation['relationship'],
  explanation: string,
  sources: readonly string[],
): Observation {
  return {
    memoryId, kind, subject, relationship, explanation, sources,
    evidenceId: evidenceIdFor(memoryId, kind, subject, relationship, sources),
  };
}

function skipReason(record: MemoryRecord): string | null {
  if (record.sensitivity === 'SENSITIVE' || record.sensitivity === 'SECRET') return 'sensitive memory: not scanned';
  if (record.actionPermission === 'FORGET_OR_REDACT') return 'forgotten or marked for redaction';
  if (record.verificationStatus === 'REVOKED' || record.relationships.supersededBy !== undefined) return 'revoked or superseded';
  if (record.scope.kind === 'RESTRICTED' && (record.scope.environment !== undefined || record.scope.component !== undefined || record.scope.path === undefined)) {
    return 'restricted to an environment or component: repository files cannot tell which one';
  }
  return null;
}

export function observeRecords(
  records: readonly MemoryRecord[],
  facts: RepositoryFacts,
  projectFileExists: ReadonlyMap<string, boolean>,
  now: string,
): ObservationReport {
  const repositoryPresent = presentTechnologies(facts);
  const observations: Observation[] = [];
  const unverifiable: SkippedClaim[] = [];
  const skipped: SkippedClaim[] = [];
  let checked = 0;

  for (const raw of [...records].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))) {
    const record = normalizeLegacyMemory(raw);
    const reason = skipReason(record);
    if (reason !== null) {
      skipped.push({ memoryId: record.id, reason });
      continue;
    }
    // A memory scoped to a project path is checked against that folder's manifests.
    const scopedPath = record.scope.kind === 'RESTRICTED' ? record.scope.path : undefined;
    const recordFacts = scopedPath === undefined ? facts : factsForPath(facts, scopedPath);
    const present = scopedPath === undefined ? repositoryPresent : presentTechnologies(recordFacts);
    const techs = mentionedTechnologies(record);
    const scripts = mentionedScripts(record.statement);
    const paths = mentionedPaths(record.statement);
    if (techs.length + scripts.length + paths.length === 0) continue;
    if (NEGATION.test(record.statement)) {
      skipped.push({ memoryId: record.id, reason: 'statement contains negation or change language; meaning is not guessed' });
      continue;
    }
    checked += 1;

    // Technology claims, one decision per group.
    const byGroup = new Map<string, Technology[]>();
    for (const tech of techs) byGroup.set(tech.group, [...(byGroup.get(tech.group) ?? []), tech]);
    for (const [group, claimed] of byGroup) {
      if (claimed.length > 1) {
        // "Supabase (Postgres)" style pairs where one implies the other are one claim.
        const roots = claimed.filter((tech) => !claimed.some((other) => other.implies?.includes(tech.id)));
        if (roots.length !== 1) {
          skipped.push({ memoryId: record.id, reason: `names several ${group} technologies (${claimed.map((tech) => tech.label).join(', ')})` });
          continue;
        }
        claimed.splice(0, claimed.length, roots[0]!);
      }
      const tech = claimed[0]!;
      const signals = present.get(tech.id);
      if (signals !== undefined) {
        observations.push(observation(record.id, 'technology', tech.label, 'SUPPORTS',
          `The repository uses ${tech.label} (${signals.join('; ')}).`, signals));
        continue;
      }
      const competitors = TECHNOLOGIES
        .filter((other) => other.group === group && other.id !== tech.id && present.has(other.id)
          // Consistent pairs are not competitors: Supabase implies Postgres and vice versa.
          && !(other.implies ?? []).includes(tech.id) && !(tech.implies ?? []).includes(other.id)
          // Do not list a technology that is only present because another one implies it.
          && present.get(other.id)!.some((signal) => !signal.includes('(implies ')))
        .map((other) => ({ other, signals: present.get(other.id)!.filter((signal) => !signal.includes('(implies ')) }));
      if (competitors.length > 0) {
        const sources = competitors.flatMap(({ signals: s }) => s).sort();
        observations.push(observation(record.id, 'technology', tech.label, 'CONTRADICTS',
          `No ${tech.label} found, but the repository uses ${competitors.map(({ other, signals: s }) => `${other.label} (${s.join('; ')})`).join(' and ')}.`,
          sources));
      } else {
        unverifiable.push({ memoryId: record.id, reason: `${tech.label}: no ${group} signal in the files Tamhees reads` });
      }
    }

    // Script claims.
    for (const script of scripts) {
      const manifests = recordFacts.scriptsByManifest ?? new Map<string, ReadonlySet<string>>(
        recordFacts.scripts === null ? [] : [['package.json', recordFacts.scripts]],
      );
      const definedIn = [...manifests].filter(([, names]) => names.has(script)).map(([file]) => file).sort();
      if (recordFacts.scripts === null || manifests.size === 0) {
        unverifiable.push({ memoryId: record.id, reason: `script "${script}": no package.json` });
      } else if (definedIn.length > 0) {
        observations.push(observation(record.id, 'script', script, 'SUPPORTS',
          `${definedIn[0]} defines the script "${script}".`, definedIn.map((file) => `${file}: scripts`)));
      } else {
        const available = [...recordFacts.scripts].sort();
        const where = manifests.size === 1 ? `${[...manifests.keys()][0]} has` : `None of the ${manifests.size} package.json files has`;
        observations.push(observation(record.id, 'script', script, 'CONTRADICTS',
          `${where} no script "${script}"${available.length > 0 ? ` (defined: ${available.slice(0, 12).join(', ')}${available.length > 12 ? ', …' : ''})` : ''}.`,
          [`package.json scripts (${manifests.size} manifest${manifests.size === 1 ? '' : 's'})`]));
      }
    }

    // Path claims (existence only).
    for (const path of paths) {
      const exists = projectFileExists.get(path);
      if (exists === undefined) continue;
      observations.push(exists
        ? observation(record.id, 'path', path, 'SUPPORTS', `${path} exists.`, [path])
        : observation(record.id, 'path', path, 'CONTRADICTS', `${path} no longer exists in the project.`, [path]));
    }
  }

  return {
    observedAt: now,
    filesRead: [...facts.files].sort(),
    memoriesChecked: checked,
    observations,
    unverifiable,
    skipped,
  };
}

export function observationToEvidence(item: Observation, now: string): EvidenceRecord {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: item.evidenceId,
    type: 'REPOSITORY_STATE',
    source: item.sources.join('; ').slice(0, 500),
    content: item.explanation,
    relationship: item.relationship,
    memoryIds: [item.memoryId],
    collectedAt: now,
    collectedBy: OBSERVER_ID,
    notes: `Automatic ${item.kind} observation by ${OBSERVER_ID}.`,
  };
}

export interface ObserveResult {
  readonly success: boolean;
  readonly report: ObservationReport | null;
  readonly recorded: readonly string[];
  readonly alreadyRecorded: readonly string[];
  readonly errors: readonly string[];
}

export function formatObservationText(result: ObserveResult, recordMode: boolean): string {
  const report = result.report!;
  const lines: string[] = [
    `Observed the repository (${report.filesRead.length > 0 ? report.filesRead.join(', ') : 'no known manifest files found'})`,
    `${report.memoriesChecked} memory claim(s) checked.`,
    '',
  ];
  const contradictions = report.observations.filter((item) => item.relationship === 'CONTRADICTS');
  const supports = report.observations.filter((item) => item.relationship === 'SUPPORTS');
  if (contradictions.length > 0) {
    lines.push('Memory that might be wrong:');
    for (const item of contradictions) lines.push(`  ✘ ${item.memoryId} (${item.kind} "${item.subject}"): ${item.explanation}`);
    lines.push('');
  }
  if (supports.length > 0) {
    lines.push('Memory confirmed by the repository:');
    for (const item of supports) lines.push(`  ✔ ${item.memoryId} (${item.kind} "${item.subject}"): ${item.explanation}`);
    lines.push('');
  }
  if (report.unverifiable.length > 0) {
    lines.push('Could not verify (nothing to compare against):');
    for (const item of report.unverifiable) lines.push(`  ? ${item.memoryId}: ${item.reason}`);
    lines.push('');
  }
  if (report.skipped.length > 0) {
    lines.push('Skipped:');
    for (const item of report.skipped) lines.push(`  - ${item.memoryId}: ${item.reason}`);
    lines.push('');
  }
  if (report.observations.length === 0) lines.push('No checkable claims found.');
  const fresh = report.observations.length - result.alreadyRecorded.length;
  if (recordMode) {
    lines.push(`Recorded ${result.recorded.length} new evidence record(s); ${result.alreadyRecorded.length} already recorded.`);
    if (contradictions.length > 0) lines.push(`Run "tamhees inspect" to see the effect: contradicted memories are now blocked and withheld from agents.`);
  } else if (fresh > 0) {
    lines.push(`Preview only. Run "tamhees observe --record" to store ${fresh} evidence record(s).`);
  } else if (report.observations.length > 0) {
    lines.push('All observations are already recorded.');
  }
  for (const error of result.errors) lines.push(`Error: ${error}`);
  return lines.join('\n');
}
