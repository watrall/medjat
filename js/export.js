import { API, CONTACT, request } from './crossref.js';
import { authorLine, doiURL } from './data.js';
import { annotationFor } from './annotations.js';
import { serializeCollection } from './collection.js';
import { downloadText } from './download.js';
export const EXPORT_FORMATS = {
  ris: { shortLabel: 'RIS', mime: 'application/x-research-info-systems', extension: 'ris' },
  bibtex: { shortLabel: 'BibTeX', mime: 'application/x-bibtex', extension: 'bib' },
  csv: { shortLabel: 'CSV metadata', mime: 'text/csv;charset=utf-8', extension: 'csv' },
  json: { shortLabel: 'JSON backup', mime: 'application/json', extension: 'json' },
};
export function csvCell(value) {
  let text = String(value ?? '');
  if (/^\s*[=+@-]/.test(text) || /^[\t\r]/.test(text)) text = "'" + text;
  return `"${text.replaceAll('"', '""')}"`;
}
export function scopedRecords(records, scope, matching = [], selected = new Set()) {
  if (!['all', 'matching', 'selected'].includes(scope)) throw new Error('Choose an export scope.');
  const included = scope === 'matching' ? new Set(matching) : selected;
  return new Map([...records].filter(([id]) => scope === 'all' || included.has(id)));
}
export function metadataCSV(records, research = {}) {
  const rows = [
    [
      'Title',
      'Authors',
      'Publication year',
      'Type',
      'Container',
      'DOI',
      'DOI URL',
      'Tags',
      'Notes',
    ],
  ];
  for (const { work } of records.values()) {
    const { note, tags } = annotationFor(research, work.id);
    rows.push([
      work.title,
      authorLine(work, 1000),
      work.year || '',
      work.typeLabel,
      work.container,
      work.doi,
      doiURL(work.doi),
      tags.join('; '),
      note,
    ]);
  }
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}
function withAnnotations(text, format, { note, tags }) {
  if (!note && !tags.length) return text;
  const oneLine = (value) => value.replace(/\s+/g, ' ');
  if (format === 'ris') {
    const lines = [
      ...tags.map((tag) => `KW  - ${tag}`),
      ...(note ? [`N1  - ${oneLine(note)}`] : []),
    ];
    return /^ER\s+-/m.test(text)
      ? text.replace(/^ER\s+-/m, `${lines.join('\n')}\nER  -`)
      : `${text}\n${lines.join('\n')}`;
  }
  const clean = (value) => oneLine(value).replace(/[{}]/g, '');
  const fields = [
    tags.length && `keywords = {${clean(tags.join(', '))}}`,
    note && `annote = {${clean(note)}}`,
  ].filter(Boolean);
  return text.replace(/,?\s*\}\s*$/, `,\n  ${fields.join(',\n  ')}\n}`);
}
export async function exportCollection(
  records,
  format,
  { signal, onProgress = () => {}, fetcher, research = {} } = {},
) {
  if (!EXPORT_FORMATS[format]) throw new Error('Choose an export format.');
  if (!records.size) throw new Error('Save some publications before exporting.');
  signal?.throwIfAborted();
  if (format === 'json') return serializeCollection(records, research);
  if (format === 'csv') return metadataCSV(records, research);
  const parts = [];
  let index = 0;
  for (const { work } of records.values()) {
    signal?.throwIfAborted();
    const url = `${API}/works/${encodeURIComponent(work.doi)}/transform?mailto=${encodeURIComponent(CONTACT)}`;
    const response = await request(url, {
      signal,
      format: 'text',
      fresh: true,
      headers: { Accept: EXPORT_FORMATS[format].mime },
      fetcher,
    });
    let text = response.body.trim();
    if (
      !text ||
      (format === 'bibtex' && !/^@\w+\s*\{/m.test(text)) ||
      (format === 'ris' && !/^TY\s+-/m.test(text))
    )
      throw new Error(
        `Crossref could not format “${work.title}”. Try CSV or a collection backup to keep all records.`,
      );
    if (format === 'bibtex') text = text.replace(/^(@\w+\s*\{)[^,]+,/m, `$1record${index + 1},`);
    // Crossref sometimes emits GENERIC for deposited book chapters. Preserve the
    // deposited type so reference managers import these as book sections.
    if (format === 'ris') {
      const types = {
        'journal-article': 'JOUR',
        book: 'BOOK',
        'edited-book': 'BOOK',
        monograph: 'BOOK',
        'book-chapter': 'CHAP',
        'proceedings-article': 'CPAPER',
        dissertation: 'THES',
        report: 'RPRT',
      };
      if (types[work.type])
        text = text.replace(/^TY\s+-\s*GENERIC\s*$/m, `TY  - ${types[work.type]}`);
    }
    text = withAnnotations(text, format, annotationFor(research, work.id));
    parts.push(text);
    onProgress(++index, records.size);
  }
  return parts.join('\n\n') + '\n';
}
export function downloadFile(
  text,
  format,
  { scope = 'all', count, date = new Date().toISOString().slice(0, 10) } = {},
) {
  const { mime, extension } = EXPORT_FORMATS[format];
  downloadText(text, {
    type: mime,
    filename: `medjat-${scope}${count ? `-${count}` : ''}-${date}.${extension}`,
  });
}
