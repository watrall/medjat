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
export function constellation(works, { width, height, radius = 5.4 }) {
  const records = works.filter(dated);
  const when = (work) => work.year + ((work.month ?? 6.5) - 0.5) / 12;
  const maxCited = Math.max(0, ...records.map((work) => work.citedBy ?? 0));
  const x = {
    min: Math.floor(Math.min(...records.map((work) => work.year)) / 10) * 10,
    max: new Date().getFullYear() + 2,
  };
  const y = { min: -1.75, max: Math.max(2.6, Math.log10(Math.max(1, maxCited)) + 0.55) };
  const pxPerYear = width / (x.max - x.min);
  const pxPerUnit = height / (y.max - y.min);
  const placed = [];
  const nudges = [];
  for (let across = -6; across <= 6; across++)
    for (let down = -12; down <= 12; down++)
      nudges.push([across * radius * 0.95, down * radius * 1.05]);
  nudges.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
  const points = [...records]
    .sort((a, b) => when(a) - when(b))
    .map((work) => {
      const cited = work.citedBy ?? 0;
      let px = (when(work) - x.min) * pxPerYear;
      const base = cited > 0 ? Math.log10(cited) + 0.45 : -0.62;
      let value = base;
      if (cited === 0) {
        const origin = px;
        for (const [across, down] of nudges) {
          const candidate = base + down / pxPerUnit;
          if (candidate < -1.55 || candidate > -0.1) continue;
          const clear = placed.every(
            (other) =>
              (other.px - (origin + across)) ** 2 + ((other.y - candidate) * pxPerUnit) ** 2 >=
              (2 * radius + 1) ** 2,
          );
          if (clear) {
            value = candidate;
            px = origin + across;
            break;
          }
        }
      }
      placed.push({ px, y: value });
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
    labelled: new Set(
      [...records]
        .sort((a, b) => (b.citedBy ?? 0) - (a.citedBy ?? 0))
        .filter((work) => (work.citedBy ?? 0) > 8)
        .slice(0, 3),
    ),
  };
}

// One dot per record, stacked in its publication year, grouped by type inside each stack.
export function yearStack(works, order) {
  const records = works.filter(dated);
  if (!records.length) return { rows: [], total: 0 };
  const years = records.map((work) => work.year).sort((a, b) => a - b);
  const start = Math.floor(years[Math.floor(years.length * 0.05)] / 10) * 10;
  const counts = new Map();
  const rows = records
    .filter((work) => work.year >= start)
    .sort(
      (a, b) =>
        order.indexOf(a.group) - order.indexOf(b.group) || (b.citedBy ?? 0) - (a.citedBy ?? 0),
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

export const WAFFLE_COLUMNS = 25;

// One square per record, filled group by group so each type reads as a block.
export function waffle(works, groupOf, order) {
  const sorted = [...works].sort(
    (a, b) =>
      order.indexOf(groupOf(a)) - order.indexOf(groupOf(b)) || (b.citedBy ?? 0) - (a.citedBy ?? 0),
  );
  const columns = Math.min(WAFFLE_COLUMNS, Math.max(1, sorted.length));
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
