import { normalizeDOI, plainText } from './data.js';

export const RESEARCH_LIMITS = Object.freeze({
  seeds: 50,
  referencedNodes: 100,
  edges: 500,
  reviewRows: 100,
});

export function analyzeReferences(seeds, savedIDs = [], decisions = {}) {
  const works = seeds.slice(0, RESEARCH_LIMITS.seeds),
    saved = new Set(savedIDs),
    sources = new Map(),
    unresolved = [],
    edges = [];
  for (const work of works) {
    const seen = new Set();
    for (const ref of work.references || []) {
      let doi = normalizeDOI(ref.DOI);
      const deposited = Boolean(doi);
      const label =
        plainText(ref.unstructured) ||
        [ref.author, ref['article-title'], ref['journal-title'], ref.year]
          .map((value) => plainText(String(value || '')))
          .filter(Boolean)
          .join('. ');
      const decision = decisions[`citation:${work.id}:${label}`];
      if (!doi && decision?.decision === 'confirmed') doi = normalizeDOI(decision.doi);
      if (!doi) {
        if (label && !seen.has(label)) {
          unresolved.push({ source: work.id, sourceTitle: work.title, label });
          seen.add(label);
        }
        continue;
      }
      if (seen.has(doi)) continue;
      seen.add(doi);
      if (!sources.has(doi)) sources.set(doi, { doi, label: label || doi, sources: [] });
      sources
        .get(doi)
        .sources.push({ id: work.id, title: work.title, label, researcherConfirmed: !deposited });
      edges.push({
        source: work.id,
        target: doi,
        type: deposited ? 'cites' : 'researcher-confirmed citation match',
      });
    }
    for (const [relation, entries] of Object.entries(work.relations || {}))
      for (const item of Array.isArray(entries) ? entries : []) {
        const doi = normalizeDOI(item.id);
        if (doi) edges.push({ source: work.id, target: doi, type: relation });
      }
  }
  const references = [...sources.values()].sort(
    (a, b) => b.sources.length - a.sources.length || a.doi.localeCompare(b.doi),
  );
  return {
    seeds: works.map(({ id, title }) => ({ id, title })),
    missingReferenceLists: works.filter((work) => !work.references?.length).length,
    references,
    shared: references.filter((ref) => ref.sources.length > 1),
    missing: references.filter((ref) => !saved.has(ref.doi)),
    unresolved,
    edges,
  };
}
