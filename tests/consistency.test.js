import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { repositoryFiles, siteFiles } from '../scripts/release-files.mjs';
import { readQuery } from '../js/data.js';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

async function applicationModules() {
  const names = (await readdir(new URL('js/', root))).filter((name) => name.endsWith('.js'));
  return Promise.all(names.map(async (name) => `js/${name}`));
}

test('every runtime module is listed and every listed file exists', async () => {
  const modules = await applicationModules();
  for (const module of modules)
    assert.ok(siteFiles.includes(module), `Runtime module is missing from siteFiles: ${module}`);

  for (const file of siteFiles) {
    const info = await stat(new URL(file, root));
    assert.ok(info.isFile(), `Listed runtime file is missing or not a file: ${file}`);
  }
});

test('repository and runtime manifests stay consistent', async () => {
  assert.equal(new Set(repositoryFiles).size, repositoryFiles.length);
  for (const file of siteFiles)
    assert.ok(
      repositoryFiles.includes(file),
      `Runtime file is missing from repositoryFiles: ${file}`,
    );

  for (const file of repositoryFiles) {
    const info = await stat(new URL(file, root));
    assert.ok(info.isFile(), `Listed repository file is missing or not a file: ${file}`);
  }
});

test('the landing search starts without an applied query', async () => {
  const html = await read('index.html');
  const input = html.match(/<input\s+id="searchInput"[^>]*>/);
  assert.ok(input);
  assert.doesNotMatch(input[0], /\bvalue=/);
  assert.equal(readQuery().q, '');
  assert.equal(readQuery().context, false);
});

test('static document IDs are unique', async () => {
  const html = await read('index.html');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual(duplicates, []);
});

test('every $() lookup resolves to a static or generated ID', async () => {
  const html = await read('index.html');
  const staticIDs = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
  const modules = await applicationModules();
  const source = (await Promise.all(modules.map(read))).join('\n');
  const generatedIDs = new Set([...source.matchAll(/\bid:\s*'([^']+)'/g)].map((match) => match[1]));
  const lookups = new Set([...source.matchAll(/\$\('([^']+)'\)/g)].map((match) => match[1]));
  for (const id of lookups)
    assert.ok(
      staticIDs.has(id) || generatedIDs.has(id),
      `DOM lookup has no matching static or generated ID: ${id}`,
    );
});

test('every referenced icon exists in the sprite', async () => {
  const html = await read('index.html');
  const modules = await applicationModules();
  const source = [html, ...(await Promise.all(modules.map(read)))].join('\n');
  const sprite = await read('assets/icons.svg');
  const symbols = new Set([...sprite.matchAll(/<symbol id="([^"]+)"/g)].map((match) => match[1]));
  const references = new Set([
    ...[...source.matchAll(/icons\.svg#([\w-]+)/g)].map((match) => match[1]),
    ...[...source.matchAll(/icon\('([\w-]+)'\)/g)].map((match) => match[1]),
  ]);
  for (const icon of references)
    assert.ok(symbols.has(icon), `Referenced icon is missing from assets/icons.svg: ${icon}`);
});
