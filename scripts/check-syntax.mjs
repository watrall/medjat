import { readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const modules = (await readdir(new URL('../js/', import.meta.url))).filter((name) =>
  name.endsWith('.js'),
);
for (const file of modules)
  execFileSync(process.execPath, ['--check', new URL(`../js/${file}`, import.meta.url).pathname], {
    stdio: 'inherit',
  });
console.log(`Checked ${modules.length} application modules.`);
