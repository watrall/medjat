import { displayTitle } from './data.js';
import { el } from './dom.js';

const MAX_NAMES = 3;

// What goes before the name at this position: nothing, ", ", or " and " before the last.
export const nameSeparator = (index, count) =>
  index === 0 ? '' : index === count - 1 ? ' and ' : ', ';

export function citationNames(people) {
  const names = people.map((person) => person.name);
  if (names.length > MAX_NAMES) return `${names.slice(0, MAX_NAMES).join(', ')} et al.`;
  return names.map((name, index) => nameSeparator(index, names.length) + name).join('');
}

function creators(work) {
  if (work.authors.length) return [{ role: 'authors', text: citationNames(work.authors) }];
  if (work.editors.length) {
    const label = work.editors.length > 1 ? 'eds' : 'ed';
    return [{ role: 'authors', text: `${citationNames(work.editors)} (${label}.)` }];
  }
  return [{ role: 'missing', text: 'Authors not supplied' }];
}

function source(work) {
  if (!work.container) return work.publisher ? [{ role: 'publisher', text: work.publisher }] : [];
  const volume = work.volume ? `${work.volume}${work.issue ? `(${work.issue})` : ''}` : '';
  return [
    ...(work.type === 'book-chapter' ? [{ role: 'connector', text: 'in ' }] : []),
    { role: 'container', text: displayTitle(work.container) },
    ...(volume ? [{ role: 'detail', text: ` ${volume}` }] : []),
  ];
}

// Comma-separated groups, each a run of styled pieces, in the order a citation gives them.
export function citationGroups(work, { doi = false } = {}) {
  const pages = work.pages.replace(/(\d)\s*-\s*(\d)/g, '$1–$2');
  return [
    { key: 'authors', runs: creators(work) },
    {
      key: 'year',
      runs: work.year
        ? [{ role: 'year', text: String(work.year) }]
        : [{ role: 'missing', text: 'Date not supplied' }],
    },
    { key: 'source', runs: source(work) },
    { key: 'pages', runs: pages ? [{ role: 'detail', text: pages }] : [] },
    { key: 'doi', runs: doi ? [{ role: 'doi', text: work.doi }] : [] },
  ].filter((group) => group.runs.length);
}

export function citationText(work, options) {
  return citationGroups(work, options)
    .map((group) => group.runs.map((run) => run.text).join(''))
    .join(', ');
}

export function citationLine(work, { skip = [], ...options } = {}) {
  return citationGroups(work, options)
    .filter((group) => !skip.includes(group.key))
    .flatMap((group, index) => [
      index > 0 && el('span', { class: 'cite-sep' }, ', '),
      ...group.runs.map((run) => el('span', { class: `cite-${run.role}` }, run.text)),
    ])
    .filter(Boolean);
}
