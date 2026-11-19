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
    const data = {};
    const store = backend();
    if (store) {
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (!key.startsWith(PREFIX)) continue;
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
  function importResearch(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return;
    for (const [key, value] of Object.entries(data)) {
      if (key.length > 2000 || !value || typeof value !== 'object') continue;
      reviewDecision(key, value, { imported: true });
    }
  }
  return { researchData, reviewDecision, importResearch };
}

const defaultStore = createResearchStore();

export const researchData = defaultStore.researchData;
export const reviewDecision = defaultStore.reviewDecision;
export const importResearch = defaultStore.importResearch;
