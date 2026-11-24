import {
  constellation,
  publisherTree,
  registration,
  shorten,
  typeGroups,
  waffle,
  yearStack,
} from './viz-data.js';

const escape = (text) =>
  String(text).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );
const plural = (count, one, many) => `${count.toLocaleString()} ${count === 1 ? one : many}`;
const strong = (text) => ({ strong: text });

function tip(colors, { title, line, dot, tail }) {
  const mark = dot
    ? `<span style="display:inline-block;inline-size:9px;block-size:9px;border-radius:50%;background:${dot};margin-inline-end:8px"></span>`
    : '';
  return `<div style="font:500 13px ${colors.font};padding:12px 14px;max-inline-size:320px;color:${colors.text}"><div style="font-weight:700;line-height:1.35;margin-block-end:6px">${escape(title)}</div>${line ? `<div style="color:${colors.secondary};line-height:1.5">${escape(line)}</div>` : ''}${tail ? `<div style="margin-block-start:8px;color:${colors.secondary}">${mark}${tail}</div>` : ''}</div>`;
}

const tooltip = (colors, formatter) => ({
  trigger: 'item',
  confine: true,
  borderWidth: 0,
  padding: 0,
  backgroundColor: colors.surface,
  extraCssText: 'box-shadow:0 8px 28px rgba(40,20,40,.16);border-radius:10px',
  formatter,
});

const venueLine = (work) => [work.container, work.year].filter(Boolean).join(', ');
const base = (colors, animate) => ({
  animation: animate,
  animationDuration: 700,
  animationEasing: 'cubicOut',
  textStyle: { fontFamily: colors.font },
});
const xAxis = (colors, extra) => ({
  type: 'value',
  axisLine: { show: false },
  axisTick: { show: false },
  splitLine: { show: true, lineStyle: { color: colors.line, opacity: 0.55 } },
  axisLabel: {
    color: colors.muted,
    fontFamily: colors.font,
    fontSize: 12,
    margin: 14,
    formatter: (v) => String(Math.round(v)),
  },
  ...extra,
});

function constellationChart(works, { colors, groupOf, groupNames, window }) {
  const first = constellation(works, { width: 1000, height: 480 });
  const colorOf = (work) => colors.groups[groupNames.indexOf(groupOf(work))];
  const topTitle = first.top ? shorten(first.top.work.title, 64) : '';
  return {
    id: 'cited',
    title: 'Citations',
    coverage: `${first.total} of ${window} records dated`,
    lead: first.total
      ? first.citedShare === 0
        ? ['None of these records has been cited by another Crossref record yet.']
        : [
            'Only ',
            strong(`${first.citedShare}%`),
            ' of these records have been cited by another Crossref record. The most cited, “',
            topTitle,
            '”, has ',
            strong(first.top.cited.toLocaleString()),
            '.',
          ]
      : ['No record in this window has a publication date.'],
    note: 'Each dot is one record. Across is the publication year. Up is the number of Crossref records that cite it, on a log scale. Records no one has cited yet sit in the band below the line.',
    label: `Scatter of ${first.total} dated records by publication year and citation count`,
    height: 560,
    filters: true,
    option(width, animate) {
      const margin = { left: 64, right: 28, top: 28, bottom: 44 };
      const layout = constellation(works, {
        width: width - margin.left - margin.right,
        height: 560 - margin.top - margin.bottom,
      });
      const ticks = [
        [0.45, '1 citation'],
        [1.45, '10'],
        [2.45, '100'],
        [3.45, '1,000'],
      ].filter(([y]) => y < layout.y.max);
      return {
        ...base(colors, animate),
        grid: { left: margin.left, right: margin.right, top: margin.top, bottom: margin.bottom },
        xAxis: xAxis(colors, { min: layout.x.min, max: layout.x.max, interval: 10 }),
        yAxis: { type: 'value', min: layout.y.min, max: layout.y.max, show: false },
        tooltip: tooltip(colors, (p) =>
          tip(colors, {
            title: p.data.work.title,
            line: venueLine(p.data.work),
            dot: p.color,
            tail: `${escape(p.data.work.typeLabel)} · <b>${p.data.cited.toLocaleString()}</b> ${p.data.cited === 1 ? 'citation' : 'citations'}`,
          }),
        ),
        series: [
          {
            type: 'scatter',
            symbolSize: layout.radius * 2,
            data: layout.points.map((point) => ({
              value: point.value,
              work: point.work,
              cited: point.cited,
              itemStyle: {
                color: colorOf(point.work),
                opacity: point.cited ? 0.92 : 0.78,
                borderColor: colors.canvas,
                borderWidth: 1.6,
              },
              label: layout.labelled.has(point.work)
                ? {
                    show: true,
                    formatter: () => shorten(point.work.title, 56),
                    position: point.value[0] > 2000 ? 'left' : 'right',
                    distance: 10,
                    color: colors.text,
                    fontFamily: colors.font,
                    fontSize: 12.5,
                    fontWeight: 600,
                  }
                : undefined,
            })),
            emphasis: {
              focus: 'self',
              scale: 1.9,
              itemStyle: { opacity: 1, borderColor: colors.text, borderWidth: 2 },
            },
            blur: { itemStyle: { opacity: 0.25 } },
            labelLayout: { hideOverlap: true },
            markLine: {
              silent: true,
              symbol: 'none',
              animation: false,
              lineStyle: { color: colors.line, type: [2, 5], width: 1.2 },
              label: {
                color: colors.muted,
                fontFamily: colors.font,
                fontSize: 11.5,
                fontWeight: 600,
                position: 'insideStartTop',
                distance: [0, 3],
              },
              data: [
                ...ticks.map(([yAxis, text]) => ({ yAxis, label: { formatter: text } })),
                {
                  yAxis: -0.1,
                  lineStyle: { color: colors.muted, type: 'solid', width: 1.2 },
                  label: { formatter: 'Not yet cited', position: 'insideStartBottom' },
                },
              ],
            },
          },
        ],
      };
    },
    click: (data) => (data?.work ? { open: data.work } : null),
    table: {
      head: ['Title', 'Year', 'Type', 'Citations'],
      rows: [...first.points]
        .sort((a, b) => b.cited - a.cited)
        .map((p) => ({
          cells: [p.work.title, p.work.year, p.work.typeLabel, p.cited],
          open: p.work,
        })),
    },
  };
}

function yearsChart(works, { colors, groupOf, groupNames, window }) {
  const stack = yearStack(works, groupOf, groupNames);
  const colorOf = (work) => colors.groups[groupNames.indexOf(groupOf(work))];
  const counts = new Map();
  for (const row of stack.rows ?? []) counts.set(row.year, (counts.get(row.year) ?? 0) + 1);
  if (!stack.rows?.length)
    return {
      id: 'years',
      title: 'Publication years',
      coverage: `0 of ${window} records dated`,
      lead: ['No record in this window has a publication date.'],
      note: '',
      label: '',
      height: 0,
      empty: true,
      table: { head: [], rows: [] },
    };
  return {
    id: 'years',
    title: 'Publication years',
    coverage: `${stack.total} of ${window} records dated`,
    lead: [
      strong(`${stack.sinceShare}%`),
      ' of this literature was published since 2000. The busiest year, ',
      strong(String(stack.peak.year)),
      `, has ${stack.peak.count} records${stack.peak.book ? `, ${stack.peak.book.count} of them in one book, “${shorten(stack.peak.book.name, 56)}”` : ''}.`,
    ],
    note: `Each dot is one record, stacked in its publication year and grouped by type.${stack.early ? ` ${plural(stack.early, 'earlier record is', 'earlier records are')} not shown.` : ''}`,
    label: `Dot chart of ${stack.total} records stacked by publication year, busiest year ${stack.peak.year}`,
    height: 440,
    option(width, animate) {
      const margin = { left: 28, right: 28, top: 36, bottom: 40 };
      const span = 2027 - stack.start;
      const size = Math.min(15, ((width - margin.left - margin.right) / span) * 0.78);
      return {
        ...base(colors, animate),
        grid: margin,
        xAxis: xAxis(colors, {
          min: stack.start - 0.5,
          max: 2026.5,
          interval: 10,
          axisLabel: {
            color: colors.muted,
            fontFamily: colors.font,
            fontSize: 12,
            margin: 14,
            formatter: (v) => String(Math.round(v + 0.5)),
          },
        }),
        yAxis: { type: 'value', min: 0, max: stack.tallest + 1.5, show: false },
        tooltip: tooltip(colors, (p) =>
          tip(colors, {
            title: p.data.work.title,
            line: venueLine(p.data.work),
            dot: p.color,
            tail: escape(p.data.work.typeLabel),
          }),
        ),
        series: [
          {
            type: 'scatter',
            symbolSize: size,
            data: stack.rows.map((row) => ({
              value: [row.year, row.stack - 0.5],
              work: row.work,
              itemStyle: {
                color: colorOf(row.work),
                borderColor: colors.canvas,
                borderWidth: 1.4,
                opacity: 0.94,
              },
            })),
            emphasis: {
              focus: 'self',
              scale: 1.25,
              itemStyle: { borderColor: colors.text, borderWidth: 2, opacity: 1 },
            },
            blur: { itemStyle: { opacity: 0.3 } },
            markPoint: {
              silent: true,
              symbol: 'rect',
              symbolSize: [1, 1],
              animation: false,
              label: {
                show: true,
                formatter: `${stack.peak.year}: ${stack.peak.count} records`,
                color: colors.text,
                fontFamily: colors.font,
                fontWeight: 700,
                fontSize: 12.5,
                position: 'top',
                distance: 10,
              },
              data: [{ coord: [stack.peak.year, stack.peak.count] }],
            },
          },
        ],
      };
    },
    click: (data) => (data?.work ? { open: data.work } : null),
    table: {
      head: ['Year', 'Records'],
      rows: [...counts]
        .sort((a, b) => b[0] - a[0])
        .map(([year, count]) => ({
          cells: [year, count],
          refine: { from: String(year), to: String(year) },
          refineLabel: `Search ${year}`,
        })),
    },
  };
}

function wafflesChart(works, { colors, groupOf, groupNames, groups, window }) {
  const grid = waffle(works, groupOf, groupNames);
  const colorOf = (work) => colors.groups[groupNames.indexOf(groupOf(work))];
  const lead = groups[0];
  return {
    id: 'types',
    title: 'Publication types',
    coverage: `${works.length} of ${window} records`,
    lead: [
      strong(lead.name),
      ' is the commonest type, ',
      strong(`${Math.round((100 * lead.count) / works.length)}%`),
      ` of these ${works.length.toLocaleString()} records.`,
    ],
    note: 'Each square is one record. Select a type to search Crossref for it.',
    label: `Grid of ${works.length} records by publication type`,
    height: Math.max(80, grid.rows * 26 + 8),
    maxWidth: 650,
    legend: groups.map((group, index) => ({
      name: group.name,
      count: group.count,
      share: Math.round((100 * group.count) / works.length),
      color: colors.groups[index],
      refine: group.id ? { type: group.id } : null,
    })),
    option(width, animate) {
      const size = Math.floor((width - 4) / grid.columns);
      return {
        ...base(colors, animate),
        grid: { left: 2, right: 2, top: 2, bottom: 2 },
        xAxis: { type: 'value', min: -0.5, max: grid.columns - 0.5, show: false },
        yAxis: { type: 'value', min: -0.5, max: grid.rows - 0.5, show: false },
        tooltip: tooltip(colors, (p) =>
          tip(colors, {
            title: p.data.work.title,
            line: venueLine(p.data.work),
            dot: p.color,
            tail: escape(p.data.work.typeLabel),
          }),
        ),
        series: [
          {
            type: 'scatter',
            symbol: 'roundRect',
            symbolSize: size - 4,
            data: grid.cells.map((cell) => ({
              value: [cell.column, grid.rows - 1 - cell.row],
              work: cell.work,
              itemStyle: { color: colorOf(cell.work), borderRadius: 3 },
            })),
            emphasis: { focus: 'self', scale: 1.15 },
            blur: { itemStyle: { opacity: 0.35 } },
          },
        ],
      };
    },
    click: (data) => (data?.work ? { open: data.work } : null),
    table: {
      head: ['Type', 'Records'],
      rows: groups.map((group) => ({
        cells: [group.name, group.count],
        refine: group.id ? { type: group.id } : null,
        refineLabel: `Search ${group.name}`,
      })),
    },
  };
}

function publishersChart(works, { colors, window }) {
  const tree = publisherTree(works);
  const data = tree.data.map((publisher, index) => ({
    ...publisher,
    itemStyle: { color: colors.publishers[index] },
  }));
  return {
    id: 'publishers',
    title: 'Publishers and venues',
    coverage: `${works.length} of ${window} records`,
    lead: [
      tree.data.length === 1
        ? 'One publisher accounts for '
        : `${tree.data.length === 5 ? 'Five' : tree.data.length} publishers account for `,
      strong(`${tree.shownShare}%`),
      ` of these records, led by ${tree.leader}.`,
    ],
    note: tree.restPublishers
      ? `${plural(tree.restPublishers, 'other publisher', 'other publishers')} account for the remaining ${tree.restRecords.toLocaleString()} records (${tree.restShare}%) and are not drawn. Area is the number of records. Select a venue to search for it.`
      : 'Area is the number of records. Select a venue to search for it.',
    label: `Treemap of the ${tree.data.length} largest publishers and their venues`,
    height: 460,
    option(_width, animate) {
      return {
        ...base(colors, animate),
        tooltip: {
          ...tooltip(colors, (p) =>
            tip(colors, {
              title: p.name,
              line: `${p.value.toLocaleString()} ${p.value === 1 ? 'record' : 'records'}`,
              tail:
                p.data.venue && /^[^,]+$/.test(p.data.venue) ? 'Select to search this venue' : '',
            }),
          ),
          trigger: 'item',
        },
        series: [
          {
            type: 'treemap',
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            roam: false,
            nodeClick: false,
            breadcrumb: { show: false },
            squareRatio: 1.15,
            visibleMin: 900,
            data,
            label: {
              show: true,
              color: '#fff',
              fontFamily: colors.font,
              fontWeight: 600,
              fontSize: 12.5,
              overflow: 'truncate',
              padding: [8, 10],
              position: 'insideTopLeft',
              align: 'left',
              verticalAlign: 'top',
            },
            upperLabel: {
              show: true,
              height: 34,
              color: colors.text,
              fontFamily: colors.font,
              fontWeight: 700,
              fontSize: 14,
              padding: [0, 2],
              overflow: 'truncate',
            },
            levels: [
              {
                itemStyle: { borderColor: colors.canvas, borderWidth: 0, gapWidth: 8 },
                upperLabel: { show: false },
              },
              {
                itemStyle: {
                  borderColor: colors.canvas,
                  borderWidth: 0,
                  gapWidth: 3,
                  borderRadius: 10,
                },
                upperLabel: { show: true, color: colors.text },
              },
              {
                colorSaturation: [0.35, 0.6],
                itemStyle: {
                  borderColorSaturation: 0.5,
                  gapWidth: 3,
                  borderWidth: 0,
                  borderRadius: 6,
                },
              },
            ],
            emphasis: { itemStyle: { shadowBlur: 0 } },
          },
        ],
      };
    },
    click: (data) =>
      data?.venue && !data.venue.includes(',') ? { refine: { container: data.venue } } : null,
    table: {
      head: ['Publisher', 'Venue', 'Records'],
      rows: tree.data.flatMap((publisher) =>
        publisher.children.map((child) => ({
          cells: [publisher.name, child.name, child.value],
          refine: child.venue && !child.venue.includes(',') ? { container: child.venue } : null,
          refineLabel: `Search ${shorten(child.name, 40)}`,
        })),
      ),
    },
  };
}

function registrationChart(works, { colors, groupOf, groupNames, window }) {
  const result = registration(works);
  const colorOf = (work) => colors.groups[groupNames.indexOf(groupOf(work))];
  if (!result.total)
    return {
      id: 'registration',
      title: 'When DOIs were registered',
      coverage: `0 of ${window} records`,
      lead: ['No record in this window has both a publication year and a registration year.'],
      note: '',
      label: '',
      height: 0,
      empty: true,
      table: { head: [], rows: [] },
    };
  return {
    id: 'registration',
    title: 'When DOIs were registered',
    coverage: `${result.total} of ${window} records with both years`,
    lead: result.late
      ? [
          strong(`${result.late}`),
          ` of ${result.total} records were registered with a DOI ten or more years after they were published, those published between ${result.earlyPeriod[0]} and ${result.earlyPeriod[1]}.`,
        ]
      : [
          strong(`${result.promptShare}%`),
          ' of these records were registered with a DOI the year they were published, or the year after.',
        ],
    note: 'Across is the year a record was published, up is the year its DOI was registered with Crossref. A dot on the line was registered the year it was published. The higher a dot, the later publishers digitised it. Records published before 1900 are not shown.',
    label: `Scatter of ${result.total} records by publication year and DOI registration year`,
    height: 520,
    option(_width, animate) {
      return {
        ...base(colors, animate),
        grid: { left: 56, right: 28, top: 24, bottom: 44 },
        xAxis: xAxis(colors, { min: result.xMin, max: result.yMax, interval: 20 }),
        yAxis: {
          ...xAxis(colors, { min: result.xMin, max: result.yMax, interval: 20 }),
          splitLine: { show: true, lineStyle: { color: colors.line, opacity: 0.55 } },
        },
        tooltip: tooltip(colors, (p) =>
          tip(colors, {
            title: p.data.work.title,
            line: venueLine(p.data.work),
            dot: p.color,
            tail: `Registered ${p.data.work.registered}, ${p.data.gap === 0 ? 'the year it was published' : `${Math.abs(p.data.gap)} ${Math.abs(p.data.gap) === 1 ? 'year' : 'years'} ${p.data.gap > 0 ? 'later' : 'earlier'}`}`,
          }),
        ),
        series: [
          {
            type: 'scatter',
            data: result.points.map((point) => ({
              value: point.value,
              work: point.work,
              gap: point.gap,
              symbolSize: point.gap >= 10 ? 13 : 9,
              itemStyle: {
                color: colorOf(point.work),
                opacity: point.gap >= 10 ? 0.92 : 0.7,
                borderColor: colors.canvas,
                borderWidth: 1.4,
              },
            })),
            emphasis: {
              focus: 'self',
              scale: 1.5,
              itemStyle: { opacity: 1, borderColor: colors.text, borderWidth: 2 },
            },
            blur: { itemStyle: { opacity: 0.25 } },
            markLine: {
              silent: true,
              symbol: 'none',
              animation: false,
              lineStyle: { color: colors.muted, type: 'solid', width: 1.2, opacity: 0.7 },
              label: {
                show: true,
                color: colors.muted,
                fontFamily: colors.font,
                fontSize: 11.5,
                fontWeight: 600,
                formatter: 'Registered the year it was published',
                position: 'insideMiddleTop',
                distance: 8,
              },
              data: [
                [{ coord: [result.xMin, result.xMin] }, { coord: [result.yMax, result.yMax] }],
              ],
            },
          },
        ],
      };
    },
    click: (data) => (data?.work ? { open: data.work } : null),
    table: {
      head: ['Title', 'Published', 'Registered', 'Years later'],
      rows: [...result.points]
        .sort((a, b) => b.gap - a.gap)
        .map((p) => ({
          cells: [p.work.title, p.work.year, p.work.registered, p.gap],
          open: p.work,
        })),
    },
  };
}

export function buildSections(works, colors) {
  const { groups, of } = typeGroups(works);
  const groupNames = groups.map((group) => group.name);
  const context = { colors, groupOf: of, groupNames, groups, window: works.length };
  return [
    {
      id: 'what',
      name: 'What',
      charts: [wafflesChart(works, context), publishersChart(works, context)],
    },
    {
      id: 'when',
      name: 'When',
      charts: [yearsChart(works, context), registrationChart(works, context)],
    },
    { id: 'cited', name: 'How cited', charts: [constellationChart(works, context)] },
  ];
}
