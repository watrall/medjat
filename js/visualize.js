import { aggregateSearch } from './aggregates.js';
import { addedSearchTerms, bibliographicTerms } from './crossref.js';
import { queryString } from './data.js';
import { el, icon } from './dom.js';
import { downloadText } from './download.js';
import { csvCell } from './export.js';
import { filterDescription } from './filters.js';
import { palette } from './viz-palette.js';
import { buildSections } from './viz-charts.js';
export function createVisualize(root, { onRefine, onOpenRecord, onExplore }) {
  let controller,
    generation = 0,
    renderedQuery,
    unmount = () => {};
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
      ['publisher', result.publishers],
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
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  let echartsLoad;
  const loadCharts = () =>
    (echartsLoad ??= import('../assets/vendor/echarts/echarts.js').then(
      (module) => module.echarts,
    ));

  function table(spec, act) {
    const actions = spec.table.rows.some((row) => row.refine);
    return el(
      'div',
      { class: 'viz-table' },
      el(
        'table',
        {},
        el('caption', { class: 'sr-only' }, spec.title),
        el(
          'thead',
          {},
          el(
            'tr',
            {},
            spec.table.head.map((name) => el('th', { scope: 'col' }, name)),
            actions && el('th', { scope: 'col' }, 'Search'),
          ),
        ),
        el(
          'tbody',
          {},
          spec.table.rows.map((row) =>
            el(
              'tr',
              {},
              row.cells.map((cell, index) =>
                el(
                  index === 0 && !row.refine ? 'th' : 'td',
                  index === 0 && !row.refine ? { scope: 'row' } : {},
                  index === 0 && row.open
                    ? el(
                        'button',
                        {
                          type: 'button',
                          onclick: (event) => act.open(row.open, event.currentTarget),
                        },
                        cell,
                      )
                    : typeof cell === 'number'
                      ? number(cell)
                      : cell,
                ),
              ),
              actions &&
                el(
                  'td',
                  {},
                  row.refine &&
                    el(
                      'button',
                      {
                        type: 'button',
                        onclick: (event) => act.refine(row.refine, event.currentTarget),
                      },
                      row.refineLabel,
                    ),
                ),
            ),
          ),
        ),
      ),
    );
  }

  function chartBlock(spec, act, mounts) {
    if (spec.empty)
      return el(
        'article',
        { class: 'viz-chart' },
        el('h4', {}, spec.title, el('span', { class: 'viz-coverage' }, spec.coverage)),
        el('p', { class: 'viz-lead' }, spec.lead),
      );
    const canvas = el('div', {
      class: 'viz-canvas',
      role: 'img',
      'aria-label': spec.label,
      tabindex: '-1',
      style: `height:${spec.height}px${spec.maxWidth ? `;max-inline-size:${spec.maxWidth}px` : ''}`,
    });
    mounts.push({ spec, canvas });
    const legend =
      spec.legend &&
      el(
        'ul',
        { class: 'viz-legend', 'aria-label': 'Types' },
        spec.legend.map((item) =>
          el(
            'li',
            {},
            el(
              'button',
              {
                type: 'button',
                disabled: !item.refine,
                onclick: (event) => item.refine && act.refine(item.refine, event.currentTarget),
              },
              el('i', { style: `background:${item.color}` }),
              item.name,
              el('strong', {}, `${number(item.count)} (${item.share}%)`),
            ),
          ),
        ),
      );
    return el(
      'article',
      { class: 'viz-chart' },
      el('h4', {}, spec.title, el('span', { class: 'viz-coverage' }, spec.coverage)),
      el(
        'p',
        { class: 'viz-lead' },
        spec.lead.map((part) => (typeof part === 'string' ? part : el('strong', {}, part.strong))),
      ),
      legend ? el('div', { class: 'viz-split' }, canvas, legend) : canvas,
      el('p', { class: 'viz-note' }, spec.note),
      el('details', {}, el('summary', {}, 'View data table'), table(spec, act)),
    );
  }

  async function sectionsFor(result, query) {
    const act = {
      open: (work, trigger) => onOpenRecord(work, trigger),
      refine: (filter, trigger) => onRefine(query, filter, trigger),
    };
    const mounts = [];
    const sections = buildSections(result.works, palette());
    const nav = el('nav', { class: 'viz-nav', 'aria-label': 'Sections of this analysis' });
    const elements = sections.map((section) =>
      el(
        'section',
        {
          class: 'viz-section',
          id: `viz-${section.id}`,
          'aria-labelledby': `viz-${section.id}-title`,
        },
        el('h3', { id: `viz-${section.id}-title` }, section.name),
        section.charts.map((chart) => chartBlock(chart, act, mounts)),
      ),
    );
    sections.forEach((section, index) =>
      nav.append(
        el(
          'button',
          {
            type: 'button',
            'aria-current': String(index === 0),
            onclick: () =>
              elements[index].scrollIntoView({
                behavior: reduced() ? 'auto' : 'smooth',
                block: 'start',
              }),
          },
          section.name,
        ),
      ),
    );
    const wrapper = el('div', {}, nav, elements);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible)
          [...nav.children].forEach((button, index) =>
            button.setAttribute('aria-current', String(elements[index] === visible.target)),
          );
      },
      { rootMargin: '-30% 0px -55% 0px' },
    );
    elements.forEach((element) => observer.observe(element));
    const charts = [];
    unmount = () => {
      observer.disconnect();
      for (const chart of charts) chart.dispose();
      charts.length = 0;
      unmount = () => {};
    };
    queueMicrotask(async () => {
      try {
        const echarts = await loadCharts();
        for (const { spec, canvas } of mounts) {
          const chart = echarts.init(canvas, null, { renderer: 'svg' });
          charts.push(chart);
          let width = canvas.clientWidth;
          chart.setOption(spec.option(width, !reduced()));
          chart.on('click', (params) => {
            const action = spec.click?.(params.data);
            if (action?.open) act.open(action.open, canvas);
            else if (action?.refine) act.refine(action.refine, canvas);
          });
          new ResizeObserver(() => {
            if (canvas.clientWidth === width || !canvas.isConnected) return;
            width = canvas.clientWidth;
            chart.resize();
            chart.setOption(spec.option(width, false), true);
          }).observe(canvas);
        }
      } catch {
        wrapper.prepend(
          el(
            'p',
            { class: 'notice notice-error', role: 'alert' },
            'The charts could not be drawn. The data tables below still list everything.',
          ),
        );
      }
    });
    return wrapper;
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
    unmount();
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
      root.append(await sectionsFor(result, query));
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
      unmount();
      controller?.abort();
    },
  };
}
