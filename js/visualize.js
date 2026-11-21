import { aggregateSearch, typeID } from './aggregates.js';
import { addedSearchTerms, bibliographicTerms } from './crossref.js';
import { queryString } from './data.js';
import { el, icon } from './dom.js';
import { downloadText } from './download.js';
import { csvCell } from './export.js';
import { filterDescription } from './filters.js';
export function createVisualize(root, { onRefine, onExplore }) {
  let controller,
    generation = 0,
    renderedQuery;
  const number = (value) => Number(value).toLocaleString();
  function download(result) {
    const rows = [
      [
        'Query',
        'Historical period',
        'Filters',
        'Retrieval started',
        'Retrieved',
        'Chart',
        'Category',
        'Count',
      ],
    ];
    const add = (chart, label, value) =>
      rows.push([
        result.query.q,
        result.query.period,
        JSON.stringify(result.query),
        result.startedAt,
        result.finishedAt,
        chart,
        label,
        value,
      ]);
    add('query total', 'Ranked matches', result.total ?? 'Unavailable');
    add('sample', 'Ranked window size', result.window);
    for (const [chart, rows] of [
      ['type', result.types],
      ['container-title', result.venues],
      ['published', result.years],
    ])
      for (const [label, count] of rows) add(chart, label, count);
    for (const [label, count] of Object.entries(result.availability))
      add('metadata availability', label, count);
    add(
      'interpretation',
      'Scope',
      'Charts describe the retrieved ranked window, not a corpus census. Crossref keyword totals count records matching any word; they are not a subject bibliography.',
    );
    downloadText(rows.map((row) => row.map(csvCell).join(',')).join('\r\n'), {
      type: 'text/csv;charset=utf-8',
      filename: 'medjat-whole-search-summary.csv',
    });
  }
  function panel(title, rows, { query, note, refine = () => null, denominator = null } = {}) {
    const section = el(
      'section',
      { class: 'chart-panel' },
      el('h3', {}, title),
      el('p', { class: 'scope-note' }, note),
    );
    if (!rows.length) {
      section.append(el('p', { class: 'scope-note' }, 'No data for this chart in the sample.'));
      return section;
    }
    const max = Math.max(...rows.map(([, count]) => count), denominator || 1);
    const list = el('ul', { class: 'chart-bars', 'aria-label': title });
    for (const [label, count] of rows) {
      const filter = refine(label);
      const content = [
        el('span', { class: 'chart-label' }, label),
        el(
          'span',
          { class: 'chart-count' },
          `${number(count)}${denominator > 0 ? ` (${((100 * count) / denominator).toFixed(1)}%)` : ''}`,
        ),
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
                  'aria-expanded': 'false',
                  onclick: (event) => {
                    const category = event.currentTarget;
                    const expanded = category.getAttribute('aria-expanded') === 'true';
                    list
                      .querySelector('[aria-expanded="true"]')
                      ?.setAttribute('aria-expanded', 'false');
                    list.querySelector('.chart-choice')?.remove();
                    if (expanded) return;
                    category.setAttribute('aria-expanded', 'true');
                    category.after(
                      el(
                        'div',
                        { class: 'chart-choice' },
                        el(
                          'p',
                          { class: 'scope-note' },
                          'Run a fresh Crossref search with this filter.',
                        ),
                        el(
                          'button',
                          {
                            class: 'button',
                            onclick: (event) => onRefine(query, filter, event.currentTarget),
                          },
                          filter.type && label === 'Book chapter'
                            ? 'Search for book chapters'
                            : `Search by ${filter.type ? 'type' : filter.container ? 'venue' : 'date'}: ${label}`,
                        ),
                      ),
                    );
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
  function heading(query) {
    return el(
      'h2',
      { tabindex: '-1' },
      query.field === 'author'
        ? `Analyzing Crossref results for author “${query.q}”`
        : `Analyzing Crossref results for “${query.q}”`,
    );
  }
  async function show(query, fresh = false) {
    if (!query.q) {
      renderedQuery = null;
      root.replaceChildren(
        el('h2', { tabindex: '-1' }, 'Visualize Crossref results'),
        el('p', { class: 'analysis-intro' }, 'Search Explore to visualize results.'),
        el('button', { class: 'button', onclick: onExplore }, 'Search Explore'),
      );
      return;
    }
    const key = queryString(query);
    if (!fresh && renderedQuery === key) return;
    renderedQuery = null;
    controller?.abort();
    controller = new AbortController();
    const id = ++generation;
    const title = heading(query);
    root.replaceChildren(
      title,
      el('p', { class: 'scope-note', role: 'status' }, 'Retrieving ranked summaries…'),
    );
    if (fresh) title.focus();
    try {
      const result = await aggregateSearch(query, { signal: controller.signal, fresh });
      if (id !== generation) return;
      renderedQuery = key;
      title.nextElementSibling.remove();
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
      const sample = `${number(result.window)} relevance-ranked ${result.window === 1 ? 'match' : 'matches'}`;
      const summary = !result.window
        ? 'Crossref returned no records for this chart sample.'
        : result.total === null
          ? `Charts describe ${sample}. The overall match count is unavailable.`
          : result.total > result.window
            ? `Charts describe the first ${sample}. Crossref lists ${number(result.total)} keyword matches.`
            : `Charts include all ${sample}.`;
      root.append(
        el('p', { class: 'analysis-intro' }, summary),
        el(
          'p',
          { class: 'scope-note' },
          query.field === 'author'
            ? `Added bibliographic terms: ${addedSearchTerms(query) || 'none'}.`
            : `Ranking terms: ${bibliographicTerms(query)}`,
        ),
        el('p', { class: 'scope-note' }, filterDescription(query)),
        el(
          'p',
          { class: 'scope-note' },
          `Retrieved ${new Date(result.finishedAt).toLocaleString()}. Crossref counts records that match any keyword. The ranked sample can change between requests.`,
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
            { class: 'button', onclick: () => download(result) },
            icon('download'),
            'Download aggregate CSV',
          ),
        ),
      );
      const grid = el('div', { class: 'chart-grid' });
      const years = result.years,
        yearView = el('div');
      let annual = years.length <= 40;
      function renderYears() {
        const chart = panel(
          annual ? 'Publication years' : 'Publication decades',
          annual
            ? [...years].reverse()
            : result.decades.map(([year, count]) => [`${year}s`, count]).reverse(),
          {
            query,
            note: 'Modern publication dates in the ranked sample, newest first. Years absent from the sample are not asserted to be zero. CSV retains individual years.',
            refine: (label) => {
              const year = label.replace(/s$/, '');
              return /^\d{4}$/.test(year)
                ? { from: year, to: annual ? year : String(Number(year) + 9) }
                : null;
            },
          },
        );
        if (years.length > 1)
          chart.insertBefore(
            el(
              'button',
              {
                class: 'text-button',
                onclick: () => {
                  annual = !annual;
                  renderYears();
                  yearView.querySelector('button').focus();
                },
              },
              annual ? 'Group by decade' : 'View individual years',
            ),
            chart.querySelector('.chart-bars'),
          );
        yearView.replaceChildren(chart);
      }
      renderYears();
      grid.append(yearView);
      grid.append(
        panel('Publication types', result.types, {
          query,
          note: 'Types in the ranked sample. Select a supported category to refine Explore.',
          refine: (label) => (typeID(label) ? { type: typeID(label) } : null),
        }),
      );
      grid.append(
        panel('Leading publication venues', result.venues, {
          query,
          note: 'Top ten venues in the ranked sample; records without a supplied container title are not counted. Venues containing commas cannot be refined through the API filter.',
          refine: (container) => (container.includes(',') ? null : { container }),
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
          Object.keys(names)
            .filter((name) => name in result.availability)
            .map((name) => [names[name], result.availability[name]]),
          {
            note: 'Share of the ranked sample. Categories overlap and do not sum to the total. Missing metadata does not indicate poor research quality.',
            denominator: result.window,
          },
        ),
      );
      root.append(grid);
    } catch (error) {
      if (id !== generation || controller.signal.aborted) return;
      root.querySelector('[role="status"]')?.remove();
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
