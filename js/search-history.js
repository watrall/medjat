import { PERIODS, TYPES, queryString, readQuery } from './data.js';
import { isFieldSearch, searchField } from './search-fields.js';

const KEY = 'medjat-search-history-v1';
export const MAX_RECENT = 6;
export const MAX_KEPT = 12;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

// A short time for a search card: "5 min ago", "3 h ago", "Yesterday", then "12 Nov" (with the year
// when it is not this one). A month name reads the same everywhere; numeric dates do not.
export function whenSearched(iso, now = new Date()) {
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) return '';
  const minutes = Math.floor((now - date) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h ago`;
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);
  if (days === 1) return 'Yesterday';
  const day = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return date.getFullYear() === now.getFullYear() ? day : `${day} ${date.getFullYear()}`;
}

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
  // Kept searches and the newest recent ones stay; anything older falls away.
  const trim = () => {
    const kept = entries.filter((entry) => entry.kept).slice(0, MAX_KEPT);
    const recent = entries.filter((entry) => !entry.kept).slice(0, MAX_RECENT);
    entries = entries.filter((entry) => kept.includes(entry) || recent.includes(entry));
  };
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
  trim();
  const persist = () => {
    trim();
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
