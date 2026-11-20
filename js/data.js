// Approximate ranges follow the Egypt Exploration Society's Chronology of Egypt.
export const DEFAULT_QUERY = 'ancient egypt';
export const PERIODS = [
  { id: 'predynastic', name: 'Predynastic', dates: 'c. 4400–3000 BCE', query: 'Predynastic Egypt' },
  {
    id: 'early-dynastic',
    name: 'Early Dynastic',
    dates: 'c. 3000–2686 BCE',
    query: 'Early Dynastic Egypt',
  },
  { id: 'old-kingdom', name: 'Old Kingdom', dates: 'c. 2686–2160 BCE', query: 'Old Kingdom Egypt' },
  {
    id: 'first-intermediate',
    name: 'First Intermediate',
    dates: 'c. 2160–2055 BCE',
    query: 'First Intermediate Period Egypt',
  },
  {
    id: 'middle-kingdom',
    name: 'Middle Kingdom',
    dates: 'c. 2055–1650 BCE',
    query: 'Middle Kingdom Egypt',
  },
  {
    id: 'second-intermediate',
    name: 'Second Intermediate',
    dates: 'c. 1650–1550 BCE',
    query: 'Second Intermediate Period Egypt',
  },
  { id: 'new-kingdom', name: 'New Kingdom', dates: 'c. 1550–1069 BCE', query: 'New Kingdom Egypt' },
  {
    id: 'third-intermediate',
    name: 'Third Intermediate',
    dates: 'c. 1069–664 BCE',
    query: 'Third Intermediate Period Egypt',
  },
  { id: 'late', name: 'Late Period', dates: '664–332 BCE', query: 'Late Period Egypt' },
  { id: 'ptolemaic', name: 'Ptolemaic', dates: '332–30 BCE', query: 'Ptolemaic Egypt' },
  { id: 'roman', name: 'Roman Egypt', dates: '30 BCE–395 CE', query: 'Roman Egypt' },
];

export const TYPES = new Map([
  ['journal-article', 'Journal article'],
  ['book', 'Book'],
  ['book-chapter', 'Book chapter'],
  ['proceedings-article', 'Conference paper'],
  ['dissertation', 'Dissertation'],
  ['report', 'Report'],
  ['posted-content', 'Preprint'],
  ['reference-entry', 'Reference entry'],
  ['edited-book', 'Edited book'],
  ['monograph', 'Monograph'],
  ['dataset', 'Dataset'],
]);

export function plainText(value) {
  if (typeof value !== 'string') return '';
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return value
    .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (full, key) => {
      if (key[0] !== '#') return entities[key.toLowerCase()] ?? full;
      const n = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1));
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
    })
    .replace(/<\/?(?:[a-z][\w.-]*:)?[a-z][^>]*>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeDOI(value) {
  if (typeof value !== 'string') return '';
  const doi = value
    .trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '');
  return /^10\.\d{4,9}\/[^\s<>"\\]+$/i.test(doi) ? doi.toLowerCase() : '';
}

export function doiURL(value) {
  const doi = normalizeDOI(value);
  return doi ? `https://doi.org/${doi.split('/').map(encodeURIComponent).join('/')}` : '';
}

export function safeURL(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

export function orcidURL(value) {
  if (typeof value !== 'string') return '';
  const id = value
    .replace(/^https?:\/\/orcid\.org\//i, '')
    .trim()
    .toUpperCase();
  if (!/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(id)) return '';
  const digits = id.replaceAll('-', '');
  let total = 0;
  for (const d of digits.slice(0, 15)) total = (total + Number(d)) * 2;
  const check = (12 - (total % 11)) % 11;
  return (check === 10 ? 'X' : String(check)) === digits[15] ? `https://orcid.org/${id}` : '';
}

const array = (value) => (Array.isArray(value) ? value : []);
const firstText = (value) => plainText(Array.isArray(value) ? value[0] : value);

export function normalizeWork(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new Error('Publication metadata is not a record.');
  const doi = normalizeDOI(raw.DOI);
  if (!doi) throw new Error('Publication metadata has no valid DOI.');
  const date = ['published', 'published-print', 'published-online', 'issued']
    .map((key) => raw[key]?.['date-parts']?.[0])
    .find((parts) => Array.isArray(parts) && Number.isInteger(parts[0]));
  const authors = array(raw.author)
    .filter((a) => a && typeof a === 'object')
    .map((a) => ({
      name:
        plainText(a.name) ||
        [plainText(a.given), plainText(a.family)].filter(Boolean).join(' ') ||
        'Unnamed author',
      orcid: orcidURL(a.ORCID),
      affiliations: array(a.affiliation)
        .map((a) => plainText(a?.name))
        .filter(Boolean),
    }));
  const type = typeof raw.type === 'string' ? raw.type : '';
  const suppliedTypeLabel = plainText(type).replaceAll('-', ' ');
  return {
    id: doi,
    doi,
    title: firstText(raw.title) || 'Untitled publication',
    authors,
    year: date?.[0] ?? null,
    container: firstText(raw['container-title']),
    type,
    typeLabel:
      TYPES.get(type) ||
      (type === 'other'
        ? 'Other publication'
        : suppliedTypeLabel
          ? suppliedTypeLabel[0].toUpperCase() + suppliedTypeLabel.slice(1)
          : 'Publication type not supplied'),
    abstract: plainText(raw.abstract),
    publisher: plainText(raw.publisher),
    volume: plainText(raw.volume),
    issue: plainText(raw.issue),
    pages: plainText(raw.page),
    references: array(raw.reference),
    relations: raw.relation && typeof raw.relation === 'object' ? raw.relation : {},
    funders: array(raw.funder),
    licenses: array(raw.license),
    citedBy: Number.isFinite(raw['is-referenced-by-count']) ? raw['is-referenced-by-count'] : null,
    deposited: raw.deposited?.['date-time'] || '',
    raw,
  };
}

export function authorLine(work, max = 3) {
  return work.authors.length
    ? work.authors
        .slice(0, max)
        .map((a) => a.name)
        .join(', ') + (work.authors.length > max ? ', et al.' : '')
    : 'Authors not supplied';
}

export function readQuery(search = '') {
  const p = new URLSearchParams(search);
  const year = (key) => (/^\d{4}$/.test(p.get(key) || '') ? p.get(key) : '');
  return {
    q: (p.get('q') || DEFAULT_QUERY).slice(0, 500),
    container: (p.get('container') || '').slice(0, 500),
    ...(['author', 'doi'].includes(p.get('field')) ? { field: p.get('field') } : {}),
    period: PERIODS.some((x) => x.id === p.get('period')) ? p.get('period') : '',
    context: p.get('context') !== '0',
    type: TYPES.has(p.get('type')) ? p.get('type') : '',
    from: year('from'),
    to: year('to'),
    abstract: p.get('abstract') === '1',
    orcid: p.get('orcid') === '1',
    references: p.get('references') === '1',
    sort: ['newest', 'oldest'].includes(p.get('sort')) ? p.get('sort') : 'relevance',
  };
}

export function queryString(query) {
  const p = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (key === 'context') {
      if (value === false) p.set(key, '0');
    } else if (value) p.set(key, typeof value === 'boolean' ? '1' : value);
  return p.toString();
}
