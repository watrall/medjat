import { execFileSync } from 'node:child_process';
import { repositoryFiles } from './release-files.mjs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
const allowed = new Set(repositoryFiles);
// Retired application and GitHub Pages files are permitted in legacy commits only.
const legacy = new Set([
  '.nojekyll',
  'css/style.css',
  'js/atlas.js',
  'tests/atlas.test.js',
  'tests/browser/atlas-changes.spec.js',
]);
const check = (paths, label, historical = false) => {
  const rejected = paths.filter((path) => !allowed.has(path) && !(historical && legacy.has(path)));
  if (rejected.length)
    throw new Error(`${label} contains unapproved paths:\n${rejected.join('\n')}`);
};
check(git('ls-files', '-z').split('\0').filter(Boolean), 'Tracked files');
let count = 0;
if (process.argv.includes('--history')) {
  for (const commit of git('rev-list', 'HEAD').trim().split('\n')) {
    check(
      git('ls-tree', '-r', '--name-only', '-z', commit).split('\0').filter(Boolean),
      commit,
      true,
    );
    count++;
  }
}
console.log(`Repository contents verified${count ? ` across ${count} reachable commits` : ''}`);
