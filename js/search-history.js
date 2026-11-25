import { PERIODS, TYPES, queryString, readQuery } from './data.js';
import { isFieldSearch, searchField } from './search-fields.js';

const KEY = 'medjat-search-history-v1';
export const MAX_RECENT = 8;
export const MAX_KEPT = 12;

export function describeSearch(query) {
  return [
    isFieldSearch(query.field) && `${searchField(query.field).label} search`,
    query.field === 'doi' && 'DOI',
    PERIODS.find((period) => period.id === query.period)?.name,
    TYPES.get(query.type),
    (query.from || query.to) && `${query.from || '…'}–${query.to || '…'}`,
    query.abstract && 'Has abstract',
    query.orcid && 'Has ORCID',
    query.references && 'Has references',
    query.container && `In ${query.container}`,
    query.sort === 'newest' && 'Newest first',
    query.sort === 'oldest' && 'Oldest first',
    query.sort === 'cited' && 'Most cited',
  ]
    .filter(Boolean)
    .join(', ');
}

export function createSearchHistory({ storage } = {}) {
  let entries = [];
  const backend = () => {
    try {
      return storage === undefined ? globalThis.localStorage : storage;
    } catch {
      return null;
    }
  };
  try {
    const parsed = JSON.parse(backend()?.getItem(KEY) || '[]');
    if (Array.isArray(parsed))
      entries = parsed
        .filter((entry) => entry && typeof entry.qs === 'string' && entry.qs.length < 2000)
        .map((entry) => ({ qs: entry.qs, kept: entry.kept === true, at: String(entry.at || '') }))
        .filter((entry) => readQuery(entry.qs).q);
  } catch {}
  const persist = () => {
    const kept = entries.filter((entry) => entry.kept).slice(0, MAX_KEPT);
    const recent = entries.filter((entry) => !entry.kept).slice(0, MAX_RECENT);
    entries = entries.filter((entry) => kept.includes(entry) || recent.includes(entry));
    try {
      backend()?.setItem(KEY, JSON.stringify(entries));
    } catch {}
  };
  const view = (entry) => {
    const query = readQuery(entry.qs);
    return { ...entry, query, detail: describeSearch(query) };
  };
  return {
    record(query) {
      if (!query?.q?.trim()) return;
      const qs = queryString(query);
      const previous = entries.find((entry) => entry.qs === qs);
      entries = [
        { qs, kept: previous?.kept === true, at: new Date().toISOString() },
        ...entries.filter((entry) => entry.qs !== qs),
      ];
      persist();
    },
    toggleKept(qs) {
      const entry = entries.find((item) => item.qs === qs);
      if (!entry) return false;
      if (!entry.kept && entries.filter((item) => item.kept).length >= MAX_KEPT) return false;
      entry.kept = !entry.kept;
      persist();
      return true;
    },
    remove(qs) {
      entries = entries.filter((entry) => entry.qs !== qs);
      persist();
    },
    clearRecent() {
      entries = entries.filter((entry) => entry.kept);
      persist();
    },
    kept: () => entries.filter((entry) => entry.kept).map(view),
    recent: () => entries.filter((entry) => !entry.kept).map(view),
  };
}
