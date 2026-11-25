import { openAccess } from './data.js';

export const GROUP_LIMIT = 3;
const OTHER = 'Other types';
const dated = (work) => Number.isInteger(work.year) && work.year > 1000 && work.year < 2100;
const pct = (part, whole) => (whole ? Math.round((100 * part) / whole) : 0);
const shorten = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

// The three most common types get a colour of their own, everything else shares one.
export function typeGroups(works) {
  const counts = new Map();
  for (const work of works) {
    const entry = counts.get(work.typeLabel) ?? { name: work.typeLabel, id: work.type, count: 0 };
    entry.count++;
    counts.set(work.typeLabel, entry);
  }
  const ranked = [...counts.values()].sort((a, b) => b.count - a.count);
  const named = ranked.slice(0, GROUP_LIMIT);
  const rest = ranked.slice(GROUP_LIMIT).reduce((sum, entry) => sum + entry.count, 0);
  const groups = [...named, ...(rest ? [{ name: OTHER, id: '', count: rest }] : [])];
  const known = new Set(named.map((entry) => entry.name));
  return { groups, of: (work) => (known.has(work.typeLabel) ? work.typeLabel : OTHER) };
}

// Records no one has cited sit in a band below the axis, packed so no two dots overlap.
const SPREAD = 0.12;
const LARGE_WINDOW = 400;
export function constellation(works, { width, height, radius = 5.4, pack = true }) {
  const records = works.filter(dated);
  const when = (work) => work.year + ((work.month ?? 6.5) - 0.5) / 12;
  const maxCited = Math.max(0, ...records.map((work) => work.citedBy ?? 0));
  const x = {
    min: Math.floor(Math.min(...records.map((work) => work.year)) / 10) * 10,
    max: new Date().getFullYear() + 2,
  };
  const floor = records.length > LARGE_WINDOW ? -2.3 : -1.55;
  const y = { min: floor - 0.2, max: Math.max(2.6, Math.log10(Math.max(1, maxCited)) + 0.55) };
  const pxPerYear = width / (x.max - x.min);
  const pxPerUnit = height / (y.max - y.min);
  const nudges = [];
  for (let across = -45; across <= 45; across++)
    for (let down = -64; down <= 64; down++)
      nudges.push([across * radius * 0.95, down * radius * 1.05]);
  nudges.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
  const reach = (2 * radius + 1) ** 2;
  const cell = 2 * radius + 1;
  const columns = new Map();
  const crowded = (px, y) => {
    const column = Math.floor(px / cell);
    for (let next = column - 1; next <= column + 1; next++)
      for (const other of columns.get(next) ?? [])
        if ((other.px - px) ** 2 + ((other.y - y) * pxPerUnit) ** 2 < reach) return true;
    return false;
  };
  const points = [...records]
    .sort((a, b) => when(a) - when(b))
    .map((work) => {
      const cited = work.citedBy ?? 0;
      const origin = (when(work) - x.min) * pxPerYear;
      const base = cited > 0 ? Math.log10(cited) + 0.45 : -0.62;
      let px = origin;
      let value = base;
      // Cited records stay within a hair of their true height, so the count still reads off the
      // axis. Uncited ones can move anywhere inside their band.
      for (const [across, down] of pack ? nudges : []) {
        const candidate = base + down / pxPerUnit;
        if (cited > 0 ? Math.abs(candidate - base) > SPREAD : candidate < floor || candidate > -0.1)
          continue;
        const sideways = origin + across;
        if (sideways < 0 || sideways > width) continue;
        if (!crowded(sideways, candidate)) {
          px = sideways;
          value = candidate;
          break;
        }
      }
      const key = Math.floor(px / cell);
      columns.set(key, [...(columns.get(key) ?? []), { px, y: value }]);
      return { work, cited, value: [x.min + px / pxPerYear, value], px, y: value };
    });
  const citedCount = records.filter((work) => (work.citedBy ?? 0) > 0).length;
  const top = [...records].sort((a, b) => (b.citedBy ?? 0) - (a.citedBy ?? 0))[0];
  return {
    points,
    x,
    y,
    radius,
    total: records.length,
    citedShare: pct(citedCount, records.length),
    top: top && { work: top, cited: top.citedBy ?? 0 },
    labelled: new Set(top && (top.citedBy ?? 0) > 8 ? [top] : []),
  };
}

// One dot per record, stacked in its publication year, grouped by type inside each stack.
export function yearStack(works, groupOf, order) {
  const records = works.filter(dated);
  if (!records.length) return { rows: [], total: 0 };
  const years = records.map((work) => work.year).sort((a, b) => a - b);
  const start = Math.floor(years[Math.floor(years.length * 0.05)] / 10) * 10;
  const counts = new Map();
  const rows = records
    .filter((work) => work.year >= start)
    .sort(
      (a, b) =>
        order.indexOf(groupOf(a)) - order.indexOf(groupOf(b)) ||
        (b.citedBy ?? 0) - (a.citedBy ?? 0),
    )
    .map((work) => {
      const stack = (counts.get(work.year) ?? 0) + 1;
      counts.set(work.year, stack);
      return { work, year: work.year, stack };
    });
  const [peakYear, peakCount] = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
  const books = new Map();
  for (const { work, year } of rows)
    if (year === peakYear && work.container)
      books.set(work.container, (books.get(work.container) ?? 0) + 1);
  const [bookName, bookCount] = [...books].sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
  return {
    rows,
    start,
    early: records.length - rows.length,
    total: records.length,
    tallest: Math.max(...counts.values()),
    peak: {
      year: peakYear,
      count: peakCount,
      book:
        bookCount >= 4 && bookCount / peakCount >= 0.4
          ? { name: bookName, count: bookCount }
          : null,
    },
    sinceShare: pct(records.filter((work) => work.year >= 2000).length, records.length),
  };
}

const VENUE_MIN = 3;
const PUBLISHERS = 5;

// The five largest publishers, each split into the venues that carry its records.
export function publisherTree(works) {
  const publishers = new Map();
  for (const work of works) {
    const name = work.publisher || 'Publisher not supplied';
    const entry = publishers.get(name) ?? { name, count: 0, venues: new Map() };
    entry.count++;
    const venue = work.container || work.title;
    entry.venues.set(venue, (entry.venues.get(venue) ?? 0) + 1);
    publishers.set(name, entry);
  }
  const ranked = [...publishers.values()].sort((a, b) => b.count - a.count);
  const top = ranked.slice(0, PUBLISHERS);
  const data = top.map((entry) => {
    const venues = [...entry.venues].sort((a, b) => b[1] - a[1]);
    const large = venues.filter(([, count]) => count >= VENUE_MIN);
    const small = venues.filter(([, count]) => count < VENUE_MIN);
    const merged = small.reduce((sum, [, count]) => sum + count, 0);
    return {
      name: entry.name,
      value: entry.count,
      children: [
        ...large.map(([name, value]) => ({ name, value, venue: name })),
        ...(merged
          ? [
              {
                name: `${small.length} other ${small.length === 1 ? 'venue' : 'venues'}`,
                value: merged,
              },
            ]
          : []),
      ],
    };
  });
  const shown = top.reduce((sum, entry) => sum + entry.count, 0);
  return {
    data,
    shown,
    shownShare: pct(shown, works.length),
    restPublishers: ranked.length - top.length,
    restRecords: works.length - shown,
    restShare: pct(works.length - shown, works.length),
    leader: top[0]?.name ?? '',
    total: works.length,
  };
}

const PERIODS = [
  ['Before 1990', 'before 1990', 0, 1989],
  ['1990s', 'in the 1990s', 1990, 1999],
  ['2000s', 'in the 2000s', 2000, 2009],
  ['2010s', 'in the 2010s', 2010, 2019],
  ['2020s', 'in the 2020s', 2020, 2099],
];

// How the mix of types changes from one period to the next, for periods that have records.
export function typeMix(works, groupOf, order) {
  const records = works.filter(dated);
  const rows = PERIODS.map(([label, when, from, to]) => {
    const inPeriod = records.filter((work) => work.year >= from && work.year <= to);
    return {
      label,
      when,
      total: inPeriod.length,
      counts: order.map((name) => inPeriod.filter((work) => groupOf(work) === name).length),
    };
  }).filter((row) => row.total);
  return { rows, total: records.length };
}

const WAFFLE_COLUMNS = 25;
const LARGE_WAFFLE_COLUMNS = 40;

// One square per record, filled group by group so each type reads as a block.
export function waffle(works, groupOf, order) {
  const sorted = [...works].sort(
    (a, b) =>
      order.indexOf(groupOf(a)) - order.indexOf(groupOf(b)) || (b.citedBy ?? 0) - (a.citedBy ?? 0),
  );
  const wide = sorted.length > LARGE_WINDOW ? LARGE_WAFFLE_COLUMNS : WAFFLE_COLUMNS;
  const columns = Math.min(wide, Math.max(1, sorted.length));
  return {
    cells: sorted.map((work, index) => ({
      work,
      group: groupOf(work),
      column: index % columns,
      row: Math.floor(index / columns),
    })),
    columns,
    rows: Math.ceil(sorted.length / columns),
  };
}

// Publication year against the year the DOI was registered: distance from the diagonal is the gap.
export function registration(works) {
  const records = works.filter(
    (work) => dated(work) && work.year >= 1900 && Number.isInteger(work.registered),
  );
  const points = records.map((work) => ({
    work,
    gap: work.registered - work.year,
    value: [work.year, work.registered],
  }));
  const late = points.filter((point) => point.gap >= 10);
  const prompt = points.filter((point) => point.gap <= 1);
  return {
    points,
    total: points.length,
    late: late.length,
    lateShare: pct(late.length, points.length),
    promptShare: pct(prompt.length, points.length),
    earlyPeriod:
      late.length > 0
        ? [
            Math.min(...late.map((point) => point.work.year)),
            Math.max(...late.map((point) => point.work.year)),
          ]
        : null,
    xMin: Math.floor(Math.min(...records.map((work) => work.year), 2020) / 10) * 10,
    yMax: new Date().getFullYear() + 1,
  };
}

export const openShare = (works) =>
  pct(works.filter((work) => openAccess(work)).length, works.length);
export { shorten };

export const FIELDS = [
  ['authors', 'Authors', 'named authors', (work) => work.authors.length > 0],
  ['abstract', 'Abstract', 'an abstract', (work) => Boolean(work.abstract)],
  ['references', 'References', 'a reference list', (work) => work.references.length > 0],
  ['license', 'License', 'a license', (work) => work.licenses.length > 0],
  ['open', 'Open license', 'an open license', (work) => openAccess(work) !== null],
  ['orcid', 'ORCID', 'an author ORCID', (work) => work.authors.some((author) => author.orcid)],
  ['funder', 'Funder', 'a funder', (work) => work.funders.length > 0],
];
const FINGERPRINT_PUBLISHERS = 5;
const FINGERPRINT_MIN = 3;

// The share of records carrying each metadata field, for all records and the largest publishers.
export function fingerprint(works) {
  const byPublisher = new Map();
  for (const work of works)
    if (work.publisher)
      byPublisher.set(work.publisher, [...(byPublisher.get(work.publisher) ?? []), work]);
  const groups = [...byPublisher]
    .filter(([, records]) => records.length >= FINGERPRINT_MIN)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, FINGERPRINT_PUBLISHERS);
  const row = (name, records) => {
    const counts = FIELDS.map(([, , , has]) => records.filter(has).length);
    return {
      name,
      total: records.length,
      counts,
      shares: counts.map((n) => pct(n, records.length)),
    };
  };
  const rows = [row('All records', works), ...groups.map(([name, records]) => row(name, records))];
  const ranked = FIELDS.map(([key, label, phrase], index) => ({
    key,
    label,
    phrase,
    share: rows[0].shares[index],
  })).sort((a, b) => b.share - a.share);
  return { rows, best: ranked[0], worst: ranked.at(-1), total: works.length };
}
