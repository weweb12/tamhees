import { copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const ASSET_NAMES = ['index.html', 'dashboard.css', 'dashboard.js'] as const;
const sourceDir = resolve(process.cwd(), 'src', 'dashboard', 'public');
const targetDir = resolve(process.cwd(), 'dist', 'src', 'dashboard', 'public');

await mkdir(targetDir, { recursive: true });
await Promise.all(ASSET_NAMES.map(async (name) => {
  await copyFile(resolve(sourceDir, name), resolve(targetDir, name));
}));
