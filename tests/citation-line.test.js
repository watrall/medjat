import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWork } from '../js/data.js';
import { citationGroups, citationNames, citationText } from '../js/citation-line.js';

const person = (given, family) => ({ given, family });
const article = {
  DOI: '10.1234/article',
  title: ['Excavations at Abydos'],
  type: 'journal-article',
  author: [person('Ada', 'Smith'), person('Bo', 'Jones'), person('Cy', 'Lee')],
  issued: { 'date-parts': [[2019]] },
  'container-title': ['Journal of Egyptian Archaeology'],
  volume: '105',
  issue: '2',
  page: '12-30',
};
const work = (overrides) => normalizeWork({ ...article, ...overrides });

test('an article reads like a citation, with commas between parts and the volume, issue and pages', () => {
  assert.equal(
    citationText(work({})),
    'Ada Smith, Bo Jones and Cy Lee, 2019, Journal of Egyptian Archaeology 105(2), 12–30',
  );
  assert.deepEqual(
    citationGroups(work({})).map((group) => group.key),
    ['authors', 'year', 'source', 'pages'],
  );
});

test('names are joined with and, and long lists are shortened with et al.', () => {
  const names = (count) => Array.from({ length: count }, (_, i) => ({ name: `Author ${i + 1}` }));
  assert.equal(citationNames(names(1)), 'Author 1');
  assert.equal(citationNames(names(2)), 'Author 1 and Author 2');
  assert.equal(citationNames(names(3)), 'Author 1, Author 2 and Author 3');
  assert.equal(citationNames(names(5)), 'Author 1, Author 2, Author 3 et al.');
});

test('a chapter says in, and a book shows its publisher instead of a container', () => {
  assert.equal(
    citationText(
      work({
        type: 'book-chapter',
        'container-title': ['Egypt at Its Origins'],
        volume: '',
        issue: '',
        page: '45-62',
      }),
    ),
    'Ada Smith, Bo Jones and Cy Lee, 2019, in Egypt at Its Origins, 45–62',
  );
  const book = work({
    type: 'book',
    'container-title': [],
    publisher: 'Oxford University Press',
    volume: '',
    issue: '',
    page: '',
  });
  assert.equal(citationText(book), 'Ada Smith, Bo Jones and Cy Lee, 2019, Oxford University Press');
  assert.equal(citationGroups(book)[2].runs[0].role, 'publisher');
});

test('missing authors and dates are said in words, editors are labelled, and all-caps journals are fixed', () => {
  const bare = work({
    author: [],
    issued: undefined,
    'container-title': ['JOURNAL OF EGYPTIAN ARCHAEOLOGY'],
    volume: '',
    issue: '',
    page: '',
  });
  assert.equal(
    citationText(bare),
    'Authors not supplied, Date not supplied, Journal of Egyptian Archaeology',
  );
  const edited = work({ author: [], editor: [person('Dee', 'Park')], type: 'edited-book' });
  assert.match(citationText(edited), /^Dee Park \(ed\.\), 2019/);
});

test('the DOI is added only when asked for, as its own last part', () => {
  assert.equal(citationText(work({})).includes('10.1234'), false);
  assert.ok(citationText(work({}), { doi: true }).endsWith(', 10.1234/article'));
});

test('every page range in a list gets an en dash', () => {
  assert.match(citationText(work({ page: '12-14, 20-22' })), /12–14, 20–22/);
});
