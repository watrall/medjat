import { notesKey } from './decision-keys.js';

export const NOTE_LIMIT = 4000;
export const TAG_LIMIT = 20;
export const TAG_LENGTH = 40;

export function parseTags(value) {
  const seen = new Set();
  const tags = [];
  const parts = Array.isArray(value) ? value : String(value ?? '').split(/[,;\n]/);
  for (const part of parts) {
    const tag = String(part).replace(/\s+/g, ' ').trim().slice(0, TAG_LENGTH);
    const key = tag.toLocaleLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length === TAG_LIMIT) break;
  }
  return tags;
}

export function annotationFor(research, doi) {
  const entry = research?.[notesKey(doi)];
  return {
    note: typeof entry?.note === 'string' ? entry.note : '',
    tags: Array.isArray(entry?.tags) ? parseTags(entry.tags) : [],
  };
}

export function annotationEntry({ note = '', tags = [] }) {
  return {
    decision: 'noted',
    note: String(note).trim().slice(0, NOTE_LIMIT),
    tags: parseTags(tags),
  };
}

export function tagCounts(records, research) {
  const counts = new Map();
  for (const id of records.keys())
    for (const tag of annotationFor(research, id).tags) {
      const key = tag.toLocaleLowerCase();
      const entry = counts.get(key) || { tag, count: 0 };
      entry.count++;
      counts.set(key, entry);
    }
  return [...counts.values()].sort((a, b) => a.tag.localeCompare(b.tag));
}
