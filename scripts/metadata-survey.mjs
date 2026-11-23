// Samples what Crossref actually deposits for scholarship on ancient Egypt, topic by topic,
// and writes the counts to docs/crossref-survey.json. Run it with: npm run survey
import { mkdir, writeFile } from 'node:fs/promises';
import { API, CONTACT } from '../js/crossref.js';

const SAMPLE = 60;
const TOPICS = [
  ['Archaeology of a site', 'Hierakonpolis excavation'],
  ['Egyptology: texts', 'Deir el-Medina ostraca'],
  ['History and philology', 'Amarna letters Akhenaten'],
  ['Conservation and art history', 'Egyptian coffin conservation'],
  ['Materials science', 'Egyptian blue pigment analysis'],
  ['Radiocarbon dating', 'radiocarbon dating Predynastic Egypt'],
  ['Geoscience', 'Nile Holocene palaeoenvironment Egypt'],
  ['Ancient DNA and bioarchaeology', 'ancient Egyptian mummies DNA genome'],
  ['Paleopathology and medicine', 'ancient Egyptian mummy computed tomography'],
];
const SELECT = [
  'DOI',
  'title',
  'type',
  'author',
  'editor',
  'abstract',
  'references-count',
  'license',
  'funder',
  'relation',
  'member',
  'publisher',
  'subject',
  'updated-by',
  'update-to',
].join(',');

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchTopic(query) {
  const params = new URLSearchParams({
    'query.bibliographic': query,
    rows: String(SAMPLE),
    select: SELECT,
    mailto: CONTACT,
  });
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(`${API}/works?${params}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return (await response.json()).message.items;
    } catch (error) {
      if (attempt === 3) throw error;
      await pause(1500 * attempt);
    }
  }
}

const hasROR = (item) =>
  (item.author ?? []).some((author) =>
    (author.affiliation ?? []).some((affiliation) =>
      (affiliation.id ?? []).some((id) => id['id-type'] === 'ROR'),
    ),
  );
const isCapitals = (item) => {
  const letters = (item.title?.[0] ?? '').replace(/[^A-Za-z]/g, '');
  return letters.length > 4 && letters === letters.toUpperCase();
};
const relationTypes = (item) => Object.keys(item.relation ?? {});
const checks = {
  abstract: (item) => Boolean(item.abstract),
  references: (item) => item['references-count'] > 0,
  subject: (item) => Boolean(item.subject?.length),
  anyLicense: (item) => Boolean(item.license?.length),
  creativeCommons: (item) => (item.license ?? []).some((l) => /creativecommons/i.test(l.URL ?? '')),
  funder: (item) => Boolean(item.funder?.length),
  funderDOI: (item) => (item.funder ?? []).some((funder) => funder.DOI),
  affiliationROR: hasROR,
  anyRelation: (item) => relationTypes(item).length > 0,
  isPartOf: (item) => relationTypes(item).includes('is-part-of'),
  updateNotice: (item) => Boolean(item['updated-by']?.length || item['update-to']?.length),
  noAuthor: (item) => !item.author?.length,
  noAuthorButEditor: (item) => !item.author?.length && Boolean(item.editor?.length),
  allCapitalsTitle: isCapitals,
  bookChapter: (item) => item.type === 'book-chapter',
  journalArticle: (item) => item.type === 'journal-article',
};
const summarize = (items) => ({
  records: items.length,
  distinctPublishers: new Set(items.map((item) => item.publisher).filter(Boolean)).size,
  counts: Object.fromEntries(
    Object.entries(checks).map(([name, test]) => [name, items.filter(test).length]),
  ),
});

const topics = [];
const unique = new Map();
for (const [label, query] of TOPICS) {
  const items = await fetchTopic(query);
  for (const item of items) unique.set(item.DOI, item);
  topics.push({ label, query, ...summarize(items) });
  await pause(500);
}
const survey = {
  surveyedAt: new Date().toISOString().slice(0, 10),
  method: `The top ${SAMPLE} relevance-ranked records Crossref returns for each query, using query.bibliographic. This is a small, relevance-ranked sample, not a census of the literature.`,
  select: SELECT,
  overall: { ...summarize([...unique.values()]), note: 'Records de-duplicated across topics.' },
  topics,
};
await mkdir(new URL('../docs/', import.meta.url), { recursive: true });
await writeFile(
  new URL('../docs/crossref-survey.json', import.meta.url),
  `${JSON.stringify(survey, null, 2)}\n`,
);
const percent = (counts, records) =>
  Object.fromEntries(
    Object.entries(counts).map(([k, v]) => [k, `${Math.round((100 * v) / records)}%`]),
  );
console.table(
  [...topics, { label: 'All (unique)', ...survey.overall }].map(({ label, records, counts }) => ({
    label,
    records,
    ...percent(counts, records),
  })),
);
