import { LARGE_WINDOW_SIZE, WINDOW_SIZE, aggregateSearch } from './aggregates.js';
import { addedSearchTerms, bibliographicTerms } from './crossref.js';
import { queryString } from './data.js';
import { el, icon } from './dom.js';
import { downloadText } from './download.js';
import { csvCell } from './export.js';
import { filterParts } from './filters.js';
import { isFieldSearch, searchField } from './search-fields.js';
import { palette } from './viz-palette.js';
import { buildSections } from './viz-charts.js';
export function createVisualize(root, { onRefine, onOpenRecord, onExplore }) {
  let controller,
    generation = 0,
    renderedQuery,
    size = WINDOW_SIZE,
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

  const leadParts = (lead) =>
    lead.map((part) => (typeof part === 'string' ? part : el('strong', {}, part.strong)));

  function canvasFor(spec, mounts) {
    const canvas = el('div', {
      class: 'viz-canvas',
      role: 'img',
      'aria-label': spec.label,
      tabindex: '-1',
      'aria-busy': 'true',
      style: `height:${spec.height}px${spec.maxWidth ? `;max-inline-size:${spec.maxWidth}px` : ''}`,
    });
    mounts.push({ spec, canvas });
    return canvas;
  }

  function chartBlock(spec, act, mounts) {
    if (spec.empty)
      return el(
        'article',
        { class: 'viz-chart' },
        el('h4', {}, spec.title, el('span', { class: 'viz-coverage' }, spec.coverage)),
        el('p', { class: 'viz-lead' }, spec.lead),
      );
    const canvas = canvasFor(spec, mounts);
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
    const parts = (part) => [
      el('h4', {}, part.title, el('span', { class: 'viz-coverage' }, part.coverage)),
      el('p', { class: 'viz-lead' }, leadParts(part.lead)),
      part === spec ? el('div', {}, canvas, legend) : canvasFor(part, mounts),
      el('p', { class: 'viz-note' }, part.note),
      el('details', {}, el('summary', {}, 'View data table'), table(part, act)),
    ];
    const left = parts(spec);
    if (!spec.side) return el('article', { class: 'viz-chart' }, left);
    const right = parts(spec.side);
    return el(
      'article',
      { class: 'viz-chart viz-pair' },
      left.flatMap((part, index) => [part, right[index]]),
    );
  }

  function sectionsFor(result, query) {
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
    const wrapper = el('div', { class: 'viz-body' }, nav, elements);
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
    const watchers = [];
    let closed = false;
    unmount = () => {
      closed = true;
      observer.disconnect();
      for (const watcher of watchers) watcher.disconnect();
      for (const chart of charts) chart.dispose();
      unmount = () => {};
    };
    loadCharts()
      .then((echarts) => {
        if (closed) return;
        for (const { spec, canvas } of mounts) {
          const chart = echarts.init(canvas, null, { renderer: 'svg' });
          charts.push(chart);
          let width = canvas.clientWidth;
          chart.setOption(spec.option(width, !reduced()));
          canvas.removeAttribute('aria-busy');
          spec.bind?.(chart, canvas);
          chart.on('click', (params) => {
            const action = spec.click?.(params.data);
            if (action?.open) act.open(action.open, canvas);
            else if (action?.refine) act.refine(action.refine, canvas);
          });
          const watcher = new ResizeObserver(() => {
            if (!canvas.clientWidth || canvas.clientWidth === width) return;
            width = canvas.clientWidth;
            chart.resize();
            chart.setOption(spec.option(width, false), true);
          });
          watcher.observe(canvas);
          watchers.push(watcher);
        }
      })
      .catch(() => {
        for (const { canvas } of mounts) canvas.removeAttribute('aria-busy');
        wrapper.prepend(
          el(
            'p',
            { class: 'notice notice-error', role: 'alert' },
            'The charts could not be drawn. The data tables below still list everything.',
          ),
        );
      });
    return wrapper;
  }
  const SIZES = [WINDOW_SIZE, LARGE_WINDOW_SIZE];

  function setBusy(busy, message = '') {
    const head = root.querySelector('.viz-head');
    if (!head) return;
    head.toggleAttribute('data-busy', busy);
    head.querySelector('.viz-loading span').textContent = message;
    for (const control of root.querySelectorAll('.viz-head button, .viz-actions button'))
      control.disabled = busy;
    root.querySelector('.viz-body')?.toggleAttribute('aria-busy', busy);
  }

  function sizeSwitch(query) {
    return el(
      'div',
      { class: 'viz-size', role: 'group', 'aria-label': 'Records analyzed' },
      el('i', { class: 'viz-spinner', 'aria-hidden': 'true' }),
      el('span', { class: 'viz-size-label' }, 'Records analyzed'),
      el(
        'div',
        { class: 'viz-segments' },
        SIZES.map((option) =>
          el(
            'button',
            {
              type: 'button',
              'data-size': String(option),
              'aria-pressed': String(option === size),
              onclick: () => {
                if (option === size) return;
                const previous = size;
                size = option;
                show(query, false, previous);
              },
            },
            number(option),
          ),
        ),
      ),
    );
  }

  function whyNotAll(total) {
    return el(
      'p',
      { class: 'scope-note viz-why' },
      el('strong', {}, 'Why not all records? '),
      `Crossref sends at most 1,000 records per request, so all ${number(total)} matches would take ${number(Math.ceil(total / 1000))} requests. A keyword search also matches any word, so deeper results drift off topic.`,
    );
  }

  // What Crossref was asked and which filters narrowed it, with the values set in heavier type.
  function scopeNote(query) {
    const added = addedSearchTerms(query);
    const terms = isFieldSearch(query.field)
      ? added && ['Added terms ', el('strong', {}, added), '. ']
      : ['Ranked on ', el('strong', {}, bibliographicTerms(query)), '. '];
    const filters = filterParts(query).flatMap(([label, value], index) => [
      index ? ', ' : '',
      value ? [`${label} `, el('strong', {}, value)] : el('strong', {}, label),
    ]);
    return el(
      'p',
      { class: 'scope-note viz-scope' },
      terms || '',
      filters.length ? ['Filtered by ', ...filters] : 'No publication filters.',
    );
  }

  function headFor(result, query, title) {
    const sample = `${number(result.window)} relevance-ranked ${result.window === 1 ? 'match' : 'matches'}`;
    const summary = !result.window
      ? 'Crossref returned no records for this chart sample.'
      : result.total === null
        ? `Charts describe ${sample}. The overall match count is unavailable.`
        : result.total > result.window
          ? `Charts describe the first ${sample}. Crossref lists ${number(result.total)} keyword matches.`
          : `Charts include all ${sample}.`;
    return [
      el(
        'div',
        { class: 'viz-titlebar' },
        title,
        el(
          'div',
          { class: 'viz-actions' },
          el(
            'button',
            { class: 'button', onclick: () => show(query, true) },
            icon('refresh-cw'),
            'Refresh',
          ),
          el(
            'button',
            { class: 'button', onclick: () => download(result) },
            icon('download'),
            'Download CSV',
          ),
        ),
      ),
      el(
        'div',
        { class: 'viz-head' },
        el(
          'div',
          { class: 'viz-head-column' },
          el('p', { class: 'analysis-intro viz-head-lead' }, summary),
          el(
            'p',
            { class: 'scope-note' },
            'Crossref counts records that match any keyword, and the ranked sample can change between requests.',
          ),
          scopeNote(query),
        ),
        el(
          'div',
          { class: 'viz-head-column' },
          (result.total > WINDOW_SIZE || size !== WINDOW_SIZE) && sizeSwitch(query),
          result.total > result.window && whyNotAll(result.total),
        ),
        el('p', { class: 'viz-loading sr-only', role: 'status' }, el('span', {})),
      ),
    ];
  }

  function heading(query) {
    return el(
      'h2',
      { tabindex: '-1' },
      isFieldSearch(query.field)
        ? `Analyzing Crossref results for ${searchField(query.field).label.toLowerCase()} “${query.q}”`
        : `Analyzing Crossref results for “${query.q}”`,
    );
  }

  // `previousSize` is set only when the size switch asked for this, so the header and controls stay
  // on screen while the larger window loads.
  async function show(query, fresh = false, previousSize) {
    if (!query.q) {
      renderedQuery = null;
      root.replaceChildren(
        el('h2', { tabindex: '-1' }, 'Visualize Crossref results'),
        el('p', { class: 'analysis-intro' }, 'Search Explore to visualize results.'),
        el('button', { class: 'button', onclick: onExplore }, 'Search Explore'),
      );
      return;
    }
    const switching = previousSize !== undefined;
    const key = `${queryString(query)}|${size}`;
    if (!fresh && !switching && renderedQuery === key) return;
    controller?.abort();
    controller = new AbortController();
    const id = ++generation;
    let title;
    if (switching) {
      title = root.querySelector('h2');
      setBusy(true, `Retrieving ${number(size)} ranked records. This can take several seconds…`);
    } else {
      renderedQuery = null;
      unmount();
      title = heading(query);
      root.replaceChildren(
        title,
        el(
          'p',
          { class: 'scope-note viz-loading viz-loading-page', role: 'status' },
          el('i', { class: 'viz-spinner', 'aria-hidden': 'true' }),
          el('span', {}, 'Retrieving ranked summaries…'),
        ),
      );
      if (fresh) title.focus();
    }
    try {
      const result = await aggregateSearch(query, { signal: controller.signal, fresh, size });
      if (id !== generation) return;
      renderedQuery = key;
      unmount();
      if (result.doi) {
        root.replaceChildren(
          title,
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
      root.replaceChildren(
        ...headFor(result, query, title),
        ...(result.window ? [sectionsFor(result, query)] : []),
      );
      if (switching) root.querySelector(`[data-size="${size}"]`)?.focus();
    } catch (error) {
      if (id !== generation || controller.signal.aborted) return;
      if (switching) {
        size = previousSize;
        setBusy(false);
      } else root.querySelector('.viz-loading-page')?.remove();
      root.querySelectorAll('.notice-error, .viz-retry').forEach((node) => node.remove());
      root.append(
        el('p', { class: 'notice notice-error', role: 'alert' }, error.message),
        el(
          'button',
          { class: 'button viz-retry', onclick: () => show(query, true) },
          'Retry summaries',
        ),
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
