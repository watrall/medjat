import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWork } from '../js/data.js';
import {
  constellation,
  publisherTree,
  registration,
  typeGroups,
  waffle,
  yearStack,
} from '../js/viz-data.js';

let counter = 0;
const work = ({
  year = 2020,
  month,
  type = 'journal-article',
  cited = 0,
  container = 'A journal',
  publisher = 'A press',
  created = year,
  title = 'A record',
} = {}) =>
  normalizeWork({
    DOI: `10.1234/viz${counter++}`,
    title: [title],
    type,
    issued: { 'date-parts': [month ? [year, month] : [year]] },
    created: { 'date-parts': [[created]] },
    'is-referenced-by-count': cited,
    'container-title': container ? [container] : [],
    publisher,
  });

test('the three commonest types get a group each and the rest share one', () => {
  const works = [
    ...Array.from({ length: 4 }, () => work({ type: 'book-chapter' })),
    ...Array.from({ length: 3 }, () => work()),
    ...Array.from({ length: 2 }, () => work({ type: 'monograph' })),
    work({ type: 'dataset' }),
    work({ type: 'grant' }),
  ];
  const { groups, of } = typeGroups(works);
  assert.deepEqual(
    groups.map((group) => [group.name, group.count]),
    [
      ['Book chapter', 4],
      ['Journal article', 3],
      ['Monograph', 2],
      ['Other types', 2],
    ],
  );
  assert.equal(of(works.at(-1)), 'Other types');
  assert.equal(groups[0].id, 'book-chapter');
});

test('the constellation separates cited from uncited records and never overlaps a dot', () => {
  const works = [
    ...Array.from({ length: 60 }, (_, i) => work({ year: 2015 + (i % 3), month: 1 + (i % 12) })),
    work({ year: 1990, cited: 120, title: 'The classic' }),
    work({ year: 2005, cited: 3 }),
    work({ year: 2005, cited: 3 }),
  ];
  const layout = constellation(works, { width: 900, height: 400 });
  assert.equal(layout.total, 63);
  assert.equal(layout.citedShare, 5);
  assert.equal(layout.top.work.title, 'The classic');
  const uncited = layout.points.filter((point) => point.cited === 0);
  assert.ok(uncited.every((point) => point.y < 0));
  assert.ok(layout.points.filter((point) => point.cited > 0).every((point) => point.y > 0));
  const unit = 400 / (layout.y.max - layout.y.min);
  for (const [i, a] of uncited.entries())
    for (const b of uncited.slice(i + 1))
      assert.ok(Math.hypot(a.px - b.px, (a.y - b.y) * unit) >= 2 * layout.radius, 'dots overlap');
  assert.deepEqual(
    [...layout.labelled].map((record) => record.title),
    ['The classic'],
  );
  const cited = layout.points.filter((point) => point.cited > 0);
  for (const [i, a] of cited.entries())
    for (const b of cited.slice(i + 1))
      assert.ok(
        Math.hypot(a.px - b.px, (a.y - b.y) * unit) >= 2 * layout.radius,
        'cited dots overlap',
      );
});

test('the year stack counts one dot per record, finds the busiest year and the book behind it', () => {
  const works = [
    ...Array.from({ length: 10 }, () => work({ year: 2015, container: 'The big book' })),
    ...Array.from({ length: 2 }, () => work({ year: 2015, container: 'Elsewhere' })),
    work({ year: 2010 }),
    work({ year: 2010 }),
    work({ year: 1972 }),
  ];
  const stack = yearStack(works, () => 'x', ['x']);
  assert.equal(stack.peak.year, 2015);
  assert.equal(stack.peak.count, 12);
  assert.deepEqual(stack.peak.book, { name: 'The big book', count: 10 });
  assert.equal(stack.rows.filter((row) => row.year === 2015).at(-1).stack, 12);
  assert.equal(stack.sinceShare, Math.round((100 * 14) / 15));
  const quiet = yearStack(
    [work({ year: 2015, container: 'A' }), work({ year: 2015, container: 'B' })],
    () => 'x',
    [],
  );
  assert.equal(quiet.peak.book, null);
  assert.deepEqual(yearStack([], () => 'x', []).rows, []);
});

test('the publisher tree keeps five publishers, merges small venues and counts the rest', () => {
  const works = [
    ...Array.from({ length: 6 }, () => work({ publisher: 'Brill', container: 'Bodzia' })),
    work({ publisher: 'Brill', container: 'One-off' }),
    work({ publisher: 'Brill', container: 'Another one-off' }),
    ...Array.from({ length: 4 }, () => work({ publisher: 'JSTOR', container: 'JEA' })),
    ...Array.from({ length: 3 }, (_, i) => work({ publisher: `Press ${i}`, container: '' })),
    ...['A', 'B', 'C', 'D'].map((publisher) => work({ publisher })),
  ];
  const tree = publisherTree(works);
  assert.equal(tree.data.length, 5);
  assert.equal(tree.data[0].name, 'Brill');
  assert.deepEqual(
    tree.data[0].children.map((child) => [child.name, child.value]),
    [
      ['Bodzia', 6],
      ['2 other venues', 2],
    ],
  );
  assert.equal(tree.data[0].children[0].venue, 'Bodzia');
  assert.equal(tree.data[0].children[1].venue, undefined);
  assert.equal(tree.restPublishers, tree.total === works.length ? 4 : -1);
  assert.equal(tree.shown + tree.restRecords, works.length);
});

test('the waffle gives every record one square, filled type by type', () => {
  const works = [
    ...Array.from({ length: 30 }, () => work()),
    ...Array.from({ length: 5 }, () => work({ type: 'book' })),
  ];
  const groupOf = (entry) => (entry.type === 'book' ? 'Book' : 'Journal');
  const grid = waffle(works, groupOf, ['Journal', 'Book']);
  assert.equal(grid.cells.length, 35);
  assert.equal(grid.columns, 25);
  assert.equal(grid.rows, 2);
  assert.deepEqual(
    new Set(grid.cells.slice(0, 30).map((cell) => cell.group)),
    new Set(['Journal']),
  );
  assert.equal(grid.cells[34].row, 1);
  assert.equal(waffle([], groupOf, []).rows, 0);
});

test('registration measures how long after publication a DOI was registered', () => {
  const works = [
    work({ year: 2019, created: 2019 }),
    work({ year: 2019, created: 2020 }),
    work({ year: 1998, created: 2020 }),
    work({ year: 1975, created: 2018 }),
    work({ year: 1850, created: 2020 }),
  ];
  const result = registration(works);
  assert.equal(result.total, 4);
  assert.equal(result.late, 2);
  assert.equal(result.lateShare, 50);
  assert.equal(result.promptShare, 50);
  assert.deepEqual(result.earlyPeriod, [1975, 1998]);
  assert.equal(registration([]).total, 0);
});
