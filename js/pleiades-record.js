import { placeSource } from './place-data.js';

const records = new Map();
const plain = (value) => (typeof value === 'string' ? value.trim() : '');
const year = (value) => (Number.isFinite(value) ? value : null);
const yearLabel = (value) => (value < 0 ? `${-value} BCE` : `${value} CE`);

export function dateRange({ start, end }) {
  if (start === null && end === null) return '';
  if (start === null) return `until ${yearLabel(end)}`;
  if (end === null) return `from ${yearLabel(start)}`;
  return start === end ? yearLabel(start) : `${yearLabel(start)} to ${yearLabel(end)}`;
}

// Pleiades is a trusted source, but the record is read from the network, so every field is
// checked before it reaches the page.
export function summarizePleiades(raw) {
  const list = (value) => (Array.isArray(value) ? value : []);
  const starts = list(raw?.locations).map((location) => year(location?.start));
  const ends = list(raw?.locations).map((location) => year(location?.end));
  const known = (values) => values.filter((value) => value !== null);
  return {
    description: plain(raw?.description),
    types: list(raw?.placeTypes).map(plain).filter(Boolean),
    start: known(starts).length ? Math.min(...known(starts)) : null,
    end: known(ends).length ? Math.max(...known(ends)) : null,
    names: list(raw?.names).length,
    creators: list(raw?.creators)
      .map((creator) => plain(creator?.name))
      .filter(Boolean),
  };
}

export function fetchPleiadesRecord(id) {
  if (!records.has(id))
    records.set(
      id,
      fetch(`${placeSource(id)}/json`, { headers: { Accept: 'application/json' } })
        .then((response) => {
          if (!response.ok) throw new Error('Pleiades did not return this record.');
          return response.json();
        })
        .then(summarizePleiades)
        .catch((error) => {
          records.delete(id);
          throw error;
        }),
    );
  return records.get(id);
}
