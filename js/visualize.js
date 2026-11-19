import { aggregateSearch, typeID } from './aggregates.js';
import { bibliographicTerms } from './crossref.js';
import { el, icon } from './dom.js';
import { downloadText } from './download.js';
import { csvCell } from './export.js';
import { filterDescription } from './filters.js';
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
  function panel(title, rows, { note, refine = () => null, denominator = null } = {}) {
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
        'Ranked summaries from Crossref. These charts describe the first matches by relevance, not a corpus census.',
      ),
      el('p', {}, `Ranking context: ${bibliographicTerms(query)}`),
      el('p', { role: 'status' }, 'Retrieving ranked summaries…'),
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
          `${result.total === null ? 'Match total unavailable' : result.total > result.window ? `Charts describe the first ${number(result.window)} relevance-ranked matches. Crossref lists ${number(result.total)} keyword matches, a count that includes any matching word.` : `${number(result.total)} ranked matches. All are included in the charts.`}`,
        ),
        el('p', {}, `Ranking context: ${bibliographicTerms(query)}`),
        el('p', { class: 'scope-note' }, filterDescription(query)),
        el(
          'p',
          { class: 'scope-note' },
          `Ranked matches retrieved ${new Date(result.finishedAt).toLocaleString()}. Crossref totals count records matching any keyword, so they are not a disciplinary census; the sample can differ between requests.`,
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
          note: 'Types in the ranked sample. Select a supported category to refine Explore.',
          refine: (label) => (typeID(label) ? { type: typeID(label) } : null),
        }),
      );
      grid.append(
        panel('Leading publication venues', result.venues, {
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
