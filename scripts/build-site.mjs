import { mkdir, copyFile, readdir, lstat, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { siteFiles } from './release-files.mjs';

const root = resolve(import.meta.dirname, '..');
const output = join(root, 'dist');
for (const file of siteFiles) {
  const source = await lstat(join(root, file));
  assert(source.isFile() && !source.isSymbolicLink(), `Expected a regular runtime file: ${file}`);
}
await rm(output, { recursive: true, force: true });
for (const file of siteFiles) {
  const target = join(output, file);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(join(root, file), target);
}
async function files(directory, prefix = '') {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix + entry.name;
    if (entry.isDirectory())
      result.push(...(await files(join(directory, entry.name), relative + '/')));
    else {
      assert(entry.isFile() && !entry.isSymbolicLink(), `Unexpected output entry: ${relative}`);
      result.push(relative);
    }
  }
  return result;
}
assert.deepEqual((await files(output)).sort(), [...siteFiles].sort());
console.log(`Built and verified ${siteFiles.length} runtime files in dist/`);
