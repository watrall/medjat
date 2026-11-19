import { normalizeWork } from './data.js';
import { researchData } from './research-store.js';
export const COLLECTION_KEY = 'ancient-egypt-research-collection-v1';
export const MAX_SAVED = 500;
export function parseCollection(text) {
  if (typeof text !== 'string' || text.length > 10 * 1024 * 1024)
    throw new Error('Choose a collection JSON file smaller than 10 MB.');
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON. Choose an exported collection.');
  }
  if (![1, 2].includes(data?.version) || !Array.isArray(data.records))
    throw new Error('This file is not a supported Medjat collection backup.');
  if (data.records.length > MAX_SAVED)
    throw new Error(
      `Collections support up to ${MAX_SAVED} publications. Import a smaller collection.`,
    );
  const records = new Map();
  for (const item of data.records) {
    const work = normalizeWork(item.raw);
    records.set(work.id, {
      work,
      savedAt: typeof item.savedAt === 'string' ? item.savedAt : new Date().toISOString(),
    });
  }
  if (
    data.version === 2 &&
    data.research &&
    typeof data.research === 'object' &&
    !Array.isArray(data.research)
  )
    records.research = data.research;
  return records;
}
export function serializeCollection(records) {
  return JSON.stringify(
    {
      format: 'Medjat collection',
      version: Object.keys(researchData()).length ? 2 : 1,
      research: researchData(),
      exportedAt: new Date().toISOString(),
      source: 'Crossref member-deposited metadata',
      records: [...records.values()].map(({ work, savedAt }) => ({ raw: work.raw, savedAt })),
    },
    null,
    2,
  );
}
export function readCollection(storage) {
  try {
    const text = storage.getItem(COLLECTION_KEY);
    return { records: text ? parseCollection(text) : new Map(), warning: '' };
  } catch {
    return {
      records: new Map(),
      warning:
        'Your saved collection could not be read. Storage may be unavailable or the stored file may be damaged. New saves will be kept for this visit; export to keep a copy.',
    };
  }
}
export function writeCollection(records, storage) {
  try {
    storage.setItem(COLLECTION_KEY, serializeCollection(records));
    return true;
  } catch {
    return false;
  }
}
export function mergeCollections(current, incoming) {
  const merged = new Map([...current, ...incoming]);
  if (merged.size > MAX_SAVED)
    throw new Error(
      `This would exceed ${MAX_SAVED} saved publications. Export and remove some publications first.`,
    );
  return merged;
}
