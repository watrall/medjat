import { normalizeDOI } from './data.js';
import { citationKey, placeKey } from './decision-keys.js';

const DECISIONS = new Map([
  ['place-scope', ['place-specific', 'not-place-specific']],
  ['place', ['suggested', 'confirmed', 'rejected']],
  ['citation', ['confirmed', 'unmatched', 'deferred', 'dismissed']],
  ['doi', ['saved', 'deferred', 'dismissed']],
  ['changes', ['accepted', 'deferred']],
]);
const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export function validateResearchBackup(data) {
  const entries = new Map();
  let skipped = 0;
  if (!isRecord(data)) return { entries, skipped };
  for (const [key, value] of Object.entries(data)) {
    const colon = key.indexOf(':');
    const kind = key.slice(0, colon);
    const id = key.slice(colon + 1);
    const valid = DECISIONS.get(kind);
    if (key.length > 2000 || !isRecord(value) || !valid?.includes(value.decision)) {
      skipped++;
      continue;
    }
    let validKey = Boolean(normalizeDOI(id));
    if (kind === 'place') {
      const separator = id.lastIndexOf(':');
      const doi = normalizeDOI(id.slice(0, separator));
      const place = id.slice(separator + 1);
      validKey =
        Boolean(doi) &&
        /^\d+$/.test(place) &&
        key === placeKey(doi, place) &&
        (value.doi === undefined || value.doi === doi) &&
        (value.place === undefined || value.place === place);
    }
    if (kind === 'citation') {
      const separator = id.indexOf(':');
      validKey =
        separator > 0 &&
        Boolean(normalizeDOI(id.slice(0, separator))) &&
        Boolean(id.slice(separator + 1).trim());
      if (value.source !== undefined || value.label !== undefined)
        validKey =
          Boolean(normalizeDOI(value.source)) &&
          typeof value.label === 'string' &&
          key === citationKey(value.source, value.label);
      if (value.decision === 'confirmed') validKey &&= Boolean(normalizeDOI(value.doi));
    }
    if (!validKey) {
      skipped++;
      continue;
    }

    // Keep the recognized metadata fields produced by the backup exporter.
    const {
      decision,
      doi,
      place,
      source,
      label,
      evidence,
      method,
      reviewedAt,
      previousDecision,
      fields,
      previousRaw,
      sources,
    } = value;
    entries.set(key, {
      decision,
      ...(normalizeDOI(doi) && { doi: normalizeDOI(doi) }),
      ...(typeof place === 'string' && kind === 'place' && { place }),
      ...(typeof source === 'string' && { source }),
      ...(typeof label === 'string' && { label }),
      ...(typeof evidence === 'string' && { evidence }),
      ...(['metadata', 'researcher'].includes(method) && { method }),
      ...(typeof reviewedAt === 'string' && { reviewedAt }),
      ...(kind === 'place-scope' && valid.includes(previousDecision) && { previousDecision }),
      ...(kind === 'changes' &&
        Array.isArray(fields) &&
        fields.every((field) => typeof field === 'string') && { fields }),
      ...(kind === 'changes' &&
        isRecord(previousRaw) &&
        normalizeDOI(previousRaw.DOI) === id && { previousRaw }),
      ...(kind === 'doi' &&
        Array.isArray(sources) &&
        sources.every(
          (entry) =>
            isRecord(entry) &&
            normalizeDOI(entry.id) &&
            typeof entry.title === 'string' &&
            typeof entry.label === 'string' &&
            typeof entry.researcherConfirmed === 'boolean',
        ) && { sources }),
    });
  }
  return { entries, skipped };
}

const PREFIX = 'egypt-research-review:';

export function createResearchStore({ storage } = {}) {
  const memory = new Map();
  const backend = () => {
    try {
      return storage === undefined ? globalThis.localStorage : storage;
    } catch {
      return null;
    }
  };
  function researchData() {
    const data = Object.create(null);
    const store = backend();
    if (store) {
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (!key?.startsWith(PREFIX)) continue;
        try {
          data[key.slice(PREFIX.length)] = JSON.parse(store.getItem(key));
        } catch {}
      }
    }
    // Session-only decisions win over an older persisted copy.
    return { ...data, ...Object.fromEntries(memory) };
  }
  function reviewDecision(key, value, { imported = false } = {}) {
    const entry = {
      ...value,
      reviewedAt:
        imported && typeof value.reviewedAt === 'string'
          ? value.reviewedAt
          : new Date().toISOString(),
    };
    try {
      const store = backend();
      if (!store) throw new Error('Storage unavailable');
      store.setItem(PREFIX + key, JSON.stringify(entry));
      memory.delete(key);
      return true;
    } catch {
      memory.set(key, entry);
      return false;
    }
  }
  function importResearch(data, reviewed = new Map()) {
    const { entries, skipped } = validateResearchBackup(data);
    const current = researchData();
    let kept = 0;
    let sessionOnly = false;
    for (const [key, value] of entries) {
      if (
        Object.hasOwn(current, key) &&
        (!reviewed.has(key) || JSON.stringify(reviewed.get(key)) !== JSON.stringify(current[key]))
      ) {
        kept++;
        continue;
      }
      if (!reviewDecision(key, value, { imported: true })) sessionOnly = true;
    }
    return { kept, skipped, sessionOnly };
  }
  return { researchData, reviewDecision, importResearch };
}

const defaultStore = createResearchStore();

export const researchData = defaultStore.researchData;
export const reviewDecision = defaultStore.reviewDecision;
export const importResearch = defaultStore.importResearch;
