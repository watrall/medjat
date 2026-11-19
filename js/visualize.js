import { aggregateSearch, facetRows, typeID } from './aggregates.js';
import { bibliographicTerms } from './crossref.js';
import { el, icon } from './dom.js';
import { csvCell } from './export.js';
export function createVisualize(root, { onRefine }) {
  let controller,
    generation = 0,
    current;
  const number = (value) => Number(value).toLocaleString();
  function download(result) {
    const rows = [
      [
        'Query',
        'Historical period',
        'Filters',
        'Retrieved',
        'Chart',
        'Category',
        'Approximate count',
      ],
    ];
    const add = (chart, label, value) =>
      rows.push([
        result.query.q,
        result.query.period,
        JSON.stringify(result.query),
        result.finishedAt,
        chart,
        label,
        value,
      ]);
    for (const [key, facet] of Object.entries(result.facets))
      for (const [label, count] of facetRows(facet)) add(key, label, count);
    for (const [label, count] of Object.entries(result.availability))
      add('metadata availability', label, count);
    const url = URL.createObjectURL(
      new Blob([rows.map((row) => row.map(csvCell).join(',')).join('\r\n')], {
        type: 'text/csv;charset=utf-8',
      }),
    );
    const link = el('a', { href: url, download: 'crossref-whole-search-summary.csv' });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function panel(title, rows, { note, refine = () => null } = {}) {
    const section = el(
      'section',
      { class: 'chart-panel' },
      el('h3', {}, title),
      el('p', { class: 'scope-note' }, note),
    );
    if (!rows.length) {
      section.append(el('p', {}, 'No aggregate values were supplied for this chart.'));
      return section;
    }
    const max = Math.max(...rows.map(([, count]) => count), 1);
    const list = el('ul', { class: 'chart-bars', 'aria-label': title });
    for (const [label, count] of rows) {
      const filter = refine(label);
      const content = [
        el('span', { class: 'chart-label' }, label),
        el('span', { class: 'chart-count' }, number(count)),
        el(
          'span',
          { class: 'chart-track', 'aria-hidden': 'true' },
          el('span', { style: `width:${(count / max) * 100}%` }),
        ),
      ];
      list.append(
        el(
          'li',
          {},
          filter
            ? el(
                'button',
                {
                  class: 'chart-category',
                  onclick: () => {
                    const choice = el(
                      'div',
                      { class: 'chart-choice', role: 'status' },
                      el('p', {}, `${label}: approximately ${number(count)} candidates.`),
                      el(
                        'button',
                        { class: 'button', onclick: () => onRefine(filter) },
                        'Explore these publications',
                      ),
                    );
                    section.querySelector('.chart-choice')?.remove();
                    section.append(choice);
                  },
                },
                content,
              )
            : el('div', { class: 'chart-category' }, content),
        ),
      );
    }
    section.append(list);
    section.append(
      el(
        'details',
        {},
        el('summary', {}, 'View data table'),
        el(
          'table',
          {},
          el('caption', {}, title),
          el(
            'thead',
            {},
            el(
              'tr',
              {},
              el('th', { scope: 'col' }, 'Category'),
              el('th', { scope: 'col' }, 'Approximate count'),
            ),
          ),
          el(
            'tbody',
            {},
            rows.map(([label, count]) =>
              el('tr', {}, el('th', { scope: 'row' }, label), el('td', {}, number(count))),
            ),
          ),
        ),
      ),
    );
    return section;
  }
  async function show(query, fresh = false) {
    controller?.abort();
    controller = new AbortController();
    const id = ++generation;
    root.replaceChildren(
      el('h2', {}, 'Visualize your search'),
      el(
        'p',
        { class: 'analysis-intro' },
        'Whole-search summaries from Crossref. These charts do not use the first page of publications.',
      ),
      el('p', {}, `Applied keywords: ${bibliographicTerms(query)}`),
      el('p', { role: 'status' }, 'Retrieving whole-search aggregates…'),
    );
    try {
      const result = await aggregateSearch(query, { signal: controller.signal, fresh });
      if (id !== generation) return;
      current = result;
      root.replaceChildren(el('h2', {}, 'Visualize your search'));
      if (result.doi) {
        root.append(
          el('p', {}, 'An exact DOI identifies one record, not a comparative search.'),
          el('h3', {}, result.doi.title),
          el(
            'p',
            {},
            `${result.doi.year || 'Publication year not supplied'} · ${result.doi.typeLabel}`,
          ),
        );
        return;
      }
      root.append(
        el(
          'p',
          { class: 'analysis-intro' },
          `${result.total === null ? 'Candidate total unavailable' : `${number(result.total)} Crossref candidates`}. Whole applied search, not loaded records.`,
        ),
        el('p', {}, `Keywords: ${bibliographicTerms(query)}`),
        el(
          'p',
          { class: 'scope-note' },
          `Approximate API aggregates, retrieved ${new Date(result.finishedAt).toLocaleString()}. Counts may differ across requests. Keyword candidates are not a verified Egyptology corpus.`,
        ),
        el(
          'div',
          { class: 'analysis-actions' },
          el(
            'button',
            { class: 'button', onclick: () => show(query, true) },
            icon('refresh-cw'),
            'Refresh summaries',
          ),
          el(
            'button',
            { class: 'button', onclick: () => download(current) },
            icon('download'),
            'Download aggregate CSV',
          ),
        ),
      );
      for (const [key, message] of Object.entries(result.errors))
        root.append(
          el('p', { class: 'notice notice-error', role: 'status' }, `${key}: ${message}`),
        );
      const grid = el('div', { class: 'chart-grid' });
      grid.append(
        panel('Publication years', facetRows(result.facets.published, true), {
          note: 'Modern publication dates, not historical periods. Up to 1,000 returned year buckets; missing buckets are not asserted to be zero.',
          refine: (year) => (/^\d{4}$/.test(year) ? { from: year, to: year } : null),
        }),
      );
      grid.append(
        panel('Publication types', facetRows(result.facets['type-name']), {
          note: 'Types reported for the complete query. Select a supported category to refine Explore.',
          refine: (label) => (typeID(label) ? { type: typeID(label) } : null),
        }),
      );
      grid.append(
        panel('Leading publication venues', facetRows(result.facets['container-title']), {
          note: 'Top ten returned venues. This is not an exhaustive distribution; records may have multiple container titles.',
          refine: (container) => ({ container }),
        }),
      );
      const names = {
        abstract: 'Abstract supplied',
        references: 'References supplied',
        orcid: 'Author ORCID supplied',
        license: 'License supplied',
      };
      grid.append(
        panel(
          'Metadata availability',
          Object.entries(result.availability).map(([name, count]) => [names[name], count]),
          {
            note: 'Separate whole-query presence counts. Categories overlap and do not sum to the total. Missing metadata does not indicate poor research quality.',
          },
        ),
      );
      root.append(grid);
    } catch (error) {
      if (id !== generation || controller.signal.aborted) return;
      root.append(
        el('p', { class: 'notice notice-error', role: 'alert' }, error.message),
        el('button', { class: 'button', onclick: () => show(query, true) }, 'Retry summaries'),
      );
    }
  }
  return {
    show,
    cancel() {
      generation++;
      controller?.abort();
    },
  };
}
