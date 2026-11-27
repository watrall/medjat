import { normalizeDOI } from './data.js';
import { request } from './crossref.js';

export const OPENCITATIONS_API = 'https://api.opencitations.net/index/v2';

// Crossref reports how many works cite a record but not which ones. OpenCitations lists them.
// Returns the citing DOIs, newest first. OpenCitations cannot limit or page this answer.
export async function getCitingDOIs(doi, options = {}) {
  const target = normalizeDOI(doi);
  if (!target) return { dois: [] };
  const response = await request(
    `${OPENCITATIONS_API}/citations/doi:${encodeURIComponent(target).replaceAll('%2F', '/')}`,
    { ...options, shared: false, service: 'OpenCitations' },
  );
  const rows = response.body;
  if (!Array.isArray(rows)) throw new Error('OpenCitations returned an unexpected response.');
  const found = new Map();
  for (const row of rows) {
    const citing = String(row?.citing || '')
      .split(/\s+/)
      .find((id) => id.startsWith('doi:'));
    const id = normalizeDOI(citing?.slice(4));
    if (id && id !== target && !found.has(id)) found.set(id, String(row.creation || ''));
  }
  return { dois: [...found.entries()].sort((a, b) => b[1].localeCompare(a[1])).map(([id]) => id) };
}
