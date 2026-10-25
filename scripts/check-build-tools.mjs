// Runs before the automatic build (`npm run prepare`). If the build tools are missing,
// for example `npm install -g .` in a fresh clone without `npm ci` first, explain what to
// do instead of failing with a TypeScript error or silently installing no command.

import { existsSync } from 'node:fs';

const typescript = new URL('../node_modules/typescript/package.json', import.meta.url);
if (!existsSync(typescript)) {
  console.error([
    '',
    'Tamhees is not built yet, and its build tools are not installed.',
    'In the Tamhees folder, run these two commands:',
    '',
    '  npm ci',
    '  npm install -g .',
    '',
    'Then check it works with:  tamhees --version',
    '',
  ].join('\n'));
  process.exit(1);
}
