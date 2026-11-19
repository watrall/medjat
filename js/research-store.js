const PREFIX = 'egypt-research-review:';
const memory = new Map();
export function researchData() {
  const data = Object.fromEntries(memory);
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(PREFIX))
        data[key.slice(PREFIX.length)] = JSON.parse(localStorage.getItem(key));
    }
  } catch {}
  return data;
}
export function reviewDecision(key, value) {
  const entry = { ...value, reviewedAt: new Date().toISOString() };
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(entry));
    memory.delete(key);
    return true;
  } catch {
    memory.set(key, entry);
    return false;
  }
}
export function importResearch(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return;
  for (const [key, value] of Object.entries(data)) {
    if (key.length > 2000 || !value || typeof value !== 'object') continue;
    reviewDecision(key, value);
  }
}
