import {
  authorLine,
  displayTitle,
  doiURL,
  normalizeDOI,
  normalizeWork,
  licenseRows,
  openAccess,
  participationReportURL,
  plainText,
} from './data.js';
import {
  BOOK_CHAPTER_LIMIT,
  CITATION_STYLES,
  findCitationMatches,
  getBookChapters,
  getWorks,
  RELATED_LIMIT,
  getWork,
  getCitation,
} from './crossref.js';
import { citationLine } from './citation-line.js';
import { el, icon, externalLink, emptyState, notify } from './dom.js';
import { downloadText } from './download.js';
import { createCover } from './covers.js';
import { loadGazetteer, placesForWork } from './place-data.js';
import { createNotesForm } from './notes-form.js';
import {
  noticeLabel,
  reportableUpdates,
  sourceLabel,
  updateLabel,
  updateSeverity,
} from './updates.js';

const CITED_BY_NOTE =
  'Counts citations from reference lists that Crossref members deposited. It is not complete, and Crossref does not list the citing works.';
const TABS = [
  ['overview', 'Overview'],
  ['connections', 'Connections'],
  ['cite', 'Cite'],
];
let inspectorInstances = 0;

export function createInspector(
  root,
  {
    onClose,
    onSave,
    getAnnotation,
    onAnnotate,
    onPlace,
    onChange = () => {},
    onNavigate = () => {},
    isSaved = () => false,
    getUpdates = (record) => record.updates,
    savedLabel = 'Saved to collection',
  } = {},
) {
  const citationStyleId = `citationStyle-${++inspectorInstances}`;
  let work = null,
    tab = 'overview',
    style = 'apa',
    generation = 0,
    citation = '',
    citationError = '',
    citationLoading = false;
  const matches = new Map();
  let chapters = null,
    chaptersOpen = false,
    related = null;
  let book = null;
  let bookElement = null;
  let trail = [],
    referenceLimit = 20,
    followError = '',
    following = false;
  let sites = [],
    sitesRequested = false,
    focusAfterSites = null;
  function loadSites() {
    if (!onPlace || sitesRequested) return;
    sitesRequested = true;
    loadGazetteer()
      .then((data) => {
        sites = data.sites;
        if (!work) return;
        render();
        if (focusAfterSites)
          root
            .querySelector(`[data-focus-key="${CSS.escape(focusAfterSites)}"]`)
            ?.focus({ preventScroll: true });
        focusAfterSites = null;
      })
      .catch(() => {});
  }

  function readingPosition() {
    return {
      raw: work?.raw,
      tab,
      style,
      referenceLimit,
      citation,
      scrollTop: root.scrollTop,
      pageScroll: window.scrollY,
      focusKey: root.contains(document.activeElement)
        ? document.activeElement?.dataset.focusKey
        : null,
    };
  }
  function show(
    next,
    { fromReference = false, reading = null, silent = false, restorePage = true } = {},
  ) {
    generation++;
    work = next;
    tab = TABS.some(([id]) => id === reading?.tab) ? reading.tab : 'overview';
    style = CITATION_STYLES.some(([key]) => key === reading?.style) ? reading.style : style;
    referenceLimit = Math.max(
      20,
      Math.min(Number(reading?.referenceLimit) || 20, next?.references.length || 20),
    );
    citation = typeof reading?.citation === 'string' ? reading.citation : '';
    citationError = '';
    citationLoading = false;
    followError = '';
    following = false;
    matches.clear();
    chapters = null;
    chaptersOpen = false;
    related = null;
    book = work?.type === 'book-chapter' && work.partOf ? { loading: true } : null;
    if (!fromReference) trail = [];
    render();
    if (book) loadBook();
    focusAfterSites =
      restorePage && reading?.focusKey?.startsWith('place-') ? reading.focusKey : null;
    if (reading) {
      const target =
        reading.focusKey &&
        root.querySelector(`[data-focus-key="${CSS.escape(reading.focusKey)}"]`);
      if (restorePage)
        (target || root.querySelector('.detail-title'))?.focus({ preventScroll: true });
      root.scrollTop = Number(reading.scrollTop) || 0;
      if (restorePage) window.scrollTo({ top: Number(reading.pageScroll) || 0 });
    } else if (fromReference) {
      root.scrollTop = 0;
      root.querySelector('.detail-title')?.focus({ preventScroll: true });
      notify(`Opened referenced publication: ${next.title}`);
    }
    if (tab === 'cite' && !citation) loadCitation();
    if (fromReference && !silent) onNavigate();
  }
  function actionButton(savedWork) {
    return el(
      'button',
      {
        class: 'button button-primary',
        'data-focus-key': 'save',
        'aria-pressed': String(isSaved(savedWork.id)),
        onclick: () => onSave?.(savedWork),
      },
      icon(isSaved(savedWork.id) ? 'bookmark-check' : 'bookmark'),
      isSaved(savedWork.id) ? savedLabel : 'Save to collection',
    );
  }
  function render() {
    const focusKey = root.contains(document.activeElement)
      ? document.activeElement?.dataset.focusKey
      : null;
    const top = el(
      'div',
      { class: 'inspector-top' },
      el('span', { class: 'inspector-kicker' }, 'Publication details'),
      el(
        'button',
        { class: 'inspector-close', 'aria-label': 'Back to publications', onclick: onClose },
        icon('arrow-left'),
        el('span', {}, 'Back to publications'),
      ),
    );
    root.replaceChildren(top);
    if (!work) {
      root.append(
        emptyState(
          'A closer look.',
          'Choose a publication to see its details, follow references, or save it to your collection.',
          'book-open',
        ),
      );
      return;
    }
    if (trail.length)
      root.append(
        el(
          'button',
          {
            class: 'text-button',
            onclick: () => {
              const previous = trail.pop();
              show(normalizeWork(previous.raw), { fromReference: true, reading: previous });
            },
          },
          icon('arrow-left'),
          'Back to previous publication',
        ),
      );
    const tabs = el('div', {
      class: 'inspector-tabs',
      role: 'tablist',
      'aria-label': 'Publication detail views',
    });
    const choose = (id, { focus = false } = {}) => {
      tab = id;
      render();
      if (focus) root.querySelector(`[data-focus-key="tab-${id}"]`)?.focus({ preventScroll: true });
      if (id === 'cite' && !citation) loadCitation();
    };
    const arrow = { ArrowRight: 1, ArrowLeft: -1 };
    for (const [index, [id, label]] of TABS.entries())
      tabs.append(
        el(
          'button',
          {
            class: 'inspector-tab',
            role: 'tab',
            id: `${citationStyleId}-tab-${id}`,
            'aria-controls': `${citationStyleId}-panel`,
            'data-focus-key': `tab-${id}`,
            'aria-selected': String(tab === id),
            tabindex: tab === id ? '0' : '-1',
            onclick: () => choose(id),
            onkeydown: (event) => {
              const target =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? TABS.length - 1
                    : event.key in arrow
                      ? (index + arrow[event.key] + TABS.length) % TABS.length
                      : -1;
              if (target < 0) return;
              event.preventDefault();
              choose(TABS[target][0], { focus: true });
            },
          },
          label,
        ),
      );
    root.append(
      tabs,
      el('h2', { class: 'detail-title', tabindex: '-1' }, displayTitle(work.title)),
    );
    root.append(
      el(
        'div',
        { class: 'detail-authors' },
        work.authors.length
          ? work.authors.flatMap((author, index) => [
              index > 0 && (index === work.authors.length - 1 ? ' and ' : ', '),
              el(
                'span',
                {},
                author.name,
                author.orcid &&
                  externalLink(el('span', { class: 'orcid-id' }, 'iD'), author.orcid, {
                    class: 'orcid-link',
                    'aria-label': `ORCID profile for ${author.name}`,
                  }),
              ),
            ])
          : work.editors.length
            ? [
                el(
                  'span',
                  { class: 'detail-role' },
                  work.editors.length > 1 ? 'Editors: ' : 'Editor: ',
                ),
                ...work.editors.flatMap((editor, index) => [
                  index > 0 && (index === work.editors.length - 1 ? ' and ' : ', '),
                  el('span', {}, editor.name),
                ]),
              ]
            : 'Authors not supplied',
      ),
    );
    root.append(
      el('p', { class: 'detail-meta' }, citationLine(work, { skip: ['authors'] })),
      el(
        'p',
        { class: 'detail-kind' },
        [work.typeLabel, work.container && work.publisher].filter(Boolean).join(', '),
      ),
      openAccess(work) &&
        el(
          'p',
          { class: 'detail-open' },
          el('span', { class: 'metadata-badge badge-open' }, icon('book-open-text'), 'Open access'),
          externalLink(openAccess(work).label, openAccess(work).url),
        ),
      work.citedBy !== null &&
        el(
          'details',
          { class: 'detail-cited' },
          el('summary', {}, icon('quote'), `Cited by ${work.citedBy.toLocaleString()} in Crossref`),
          el('p', {}, CITED_BY_NOTE),
        ),
    );
    const banner = updateBanner();
    if (banner) root.append(banner);
    const content = el('div', {
      id: `${citationStyleId}-panel`,
      role: 'tabpanel',
      'aria-labelledby': `${citationStyleId}-tab-${tab}`,
    });
    if (tab === 'overview') overview(content);
    else if (tab === 'connections') connections(content);
    else cite(content);
    const actions = el('div', { class: 'detail-actions' });
    if (onSave) actions.append(actionButton(work));
    actions.append(
      externalLink([icon('external-link'), 'Open publication'], doiURL(work.doi), {
        class: 'button',
      }),
    );
    root.append(
      actions,
      content,
      el(
        'p',
        { class: 'detail-provenance' },
        'Metadata from Crossref, supplied by the publisher. Identifiers and relationships appear only when the publisher provided them.',
      ),
    );
    if (focusKey)
      root.querySelector(`[data-focus-key="${focusKey}"]`)?.focus({ preventScroll: true });
    onChange();
  }
  function section(title, ...children) {
    return el('section', { class: 'detail-section' }, el('h3', {}, title), ...children);
  }
  function bookSection() {
    const info = book?.work;
    const others = chapters?.works?.filter((chapter) => chapter.id !== work.id);
    bookElement = section(
      'Part of a book',
      el(
        'p',
        { class: 'book-title' },
        info
          ? displayTitle(info.title)
          : work.container || 'This chapter belongs to a containing book.',
      ),
      info && el('p', { class: 'book-citation' }, citationLine(info)),
      book?.loading &&
        el('p', { role: 'status', class: 'scope-note' }, 'Loading the book’s details…'),
      book?.error && el('p', { class: 'scope-note' }, 'The book’s details could not be loaded.'),
      el(
        'div',
        { class: 'book-actions' },
        el(
          'button',
          {
            class: 'button',
            'data-focus-key': 'book',
            disabled: following,
            onclick: () => follow(work.partOf),
          },
          icon('book-open'),
          'View the book',
        ),
        el(
          'button',
          {
            class: 'button',
            'data-focus-key': 'chapters',
            'aria-expanded': String(chaptersOpen),
            'aria-controls': 'book-chapters',
            disabled: chapters?.loading,
            onclick: toggleChapters,
          },
          others ? `Other chapters (${others.length})` : 'Other chapters',
          icon('chevron-down'),
        ),
      ),
      chaptersOpen && chapterPanel(others),
    );
    return bookElement;
  }
  function toggleChapters() {
    if (chapters?.works || chapters?.loading) {
      chaptersOpen = !chaptersOpen;
      render();
    } else {
      chaptersOpen = true;
      findChapters();
    }
  }
  // Replaces only the book section, so a note being typed in the same panel is not lost.
  async function loadBook() {
    const id = generation;
    try {
      book = { work: await getWork(work.partOf) };
    } catch {
      book = { error: true };
    }
    if (id !== generation || !bookElement?.isConnected) return;
    const stale = bookElement;
    stale.replaceWith(bookSection());
  }
  async function findChapters() {
    const id = generation;
    chapters = { loading: true };
    render();
    try {
      chapters = await getBookChapters(work.partOfID);
    } catch (error) {
      chapters = { error: error.message };
    }
    if (id === generation) render();
  }
  function chapterPanel(others) {
    return el(
      'div',
      { id: 'book-chapters', class: 'book-chapters' },
      chapters?.loading && el('p', { role: 'status', class: 'scope-note' }, 'Searching Crossref…'),
      chapters?.error && el('p', { role: 'alert', class: 'scope-note' }, chapters.error),
      others && !others.length
        ? el(
            'p',
            { class: 'scope-note', role: 'status' },
            'Crossref lists no other chapters of this book.',
          )
        : others && chapterList(others),
    );
  }
  function chapterList(others) {
    return el(
      'div',
      {},
      chapters.total > BOOK_CHAPTER_LIMIT &&
        el(
          'p',
          { class: 'scope-note', role: 'status' },
          `Showing the first ${BOOK_CHAPTER_LIMIT} of ${chapters.total.toLocaleString()} chapters Crossref lists.`,
        ),
      el(
        'ul',
        { class: 'chapter-list' },
        others.map((chapter, index) =>
          el(
            'li',
            {},
            el(
              'button',
              {
                class: 'chapter-title',
                'data-focus-key': `chapter-${index}`,
                disabled: following,
                onclick: () => follow(chapter.doi),
              },
              displayTitle(chapter.title),
            ),
            el(
              'p',
              { class: 'chapter-citation' },
              citationLine(chapter, { skip: ['year', 'source'] }),
            ),
          ),
        ),
      ),
    );
  }
  function overview(container) {
    loadSites();
    const mentions = onPlace ? placesForWork(work, sites) : [];
    if (mentions.length) {
      const links = (matches) =>
        el(
          'ul',
          { class: 'place-mention-links' },
          matches.map(({ place, evidence }) =>
            el(
              'li',
              {},
              el(
                'button',
                {
                  class: 'place-link',
                  'data-focus-key': `place-${place.id}`,
                  'aria-label': `Explore ${place.name} in Places`,
                  onclick: () => onPlace(place, work),
                },
                icon('map-pin'),
                place.name,
                evidence.alias.toLowerCase() !== place.name.toLowerCase() &&
                  el(
                    'span',
                    {
                      class: 'place-mention-field',
                      title: `Matched “${evidence.alias}” in the ${evidence.field}`,
                    },
                    `as “${evidence.alias}”`,
                  ),
              ),
            ),
          ),
        );
      const shared = mentions.filter(({ place }) => place.shared).map(({ place }) => place.name);
      const block = section(
        'Places mentioned',
        links(mentions.slice(0, 5)),
        el(
          'p',
          { class: 'scope-note' },
          'Names in the title or abstract match place records in ',
          externalLink('Pleiades', 'https://pleiades.stoa.org/'),
          '. Open a place to see the context and explore related Crossref publications.',
        ),
        shared.length > 0 &&
          el(
            'p',
            { class: 'scope-note' },
            `${shared.join(', ')}: this name is also used for places outside Egypt, so confirm that the publication concerns the Egyptian site.`,
          ),
      );
      if (mentions.length > 5)
        block.append(
          el(
            'details',
            {},
            el('summary', {}, `More places (${mentions.length - 5})`),
            links(mentions.slice(5)),
          ),
        );
      container.append(block);
    }
    if (work.type === 'book-chapter' && work.partOf) container.append(bookSection());
    if (getAnnotation && isSaved(work.id))
      container.append(
        section(
          'Your notes',
          createNotesForm(`${citationStyleId}-notes`, getAnnotation(work.id), (value) =>
            onAnnotate(work.id, value),
          ),
        ),
      );
    const cover = createCover(work);
    if (cover) container.append(cover);
    container.append(
      section(
        'Abstract',
        el(
          'p',
          { class: 'abstract-text' },
          work.abstract || 'No abstract available. Open the publication for more information.',
        ),
      ),
    );
    const fields = [
      ['DOI', externalLink(`https://doi.org/${work.doi}`, doiURL(work.doi))],
      ['Type', work.typeLabel],
      ['Published', work.year || 'Date not supplied'],
      [
        'Publisher',
        [
          work.publisher || 'Not supplied',
          participationReportURL(work) && [
            ' · ',
            externalLink('Participation Report', participationReportURL(work), {
              'aria-label': `Crossref Participation Report for ${work.publisher || 'this member'}`,
            }),
          ],
        ],
      ],
    ];
    if (work.volume) fields.push(['Volume', work.volume]);
    if (work.issue) fields.push(['Issue', work.issue]);
    if (work.pages) fields.push(['Pages', work.pages]);
    const dl = el('dl', { class: 'metadata-list' });
    for (const [key, value] of fields) dl.append(el('dt', {}, key), el('dd', {}, value));
    container.append(section('Publication record', dl));
    const affiliations = [...new Set(work.authors.flatMap((a) => a.affiliations))];
    if (affiliations.length)
      container.append(section('Author affiliations', el('p', {}, affiliations.join('; '))));
    if (work.funders.length)
      container.append(
        section(
          'Funding supplied',
          el(
            'p',
            {},
            work.funders
              .map((f) =>
                [plainText(f.name), Array.isArray(f.award) ? f.award.map(plainText).join(', ') : '']
                  .filter(Boolean)
                  .join(' · '),
              )
              .filter(Boolean)
              .join('; '),
          ),
        ),
      );
    const licenses = licenseRows(work);
    if (licenses.length)
      container.append(
        section(
          'License of this publication',
          el(
            'ul',
            { class: 'license-list' },
            licenses.map((license) =>
              el(
                'li',
                {},
                externalLink(license.label, license.url),
                license.detail && el('span', { class: 'license-detail' }, `, ${license.detail}`),
              ),
            ),
          ),
          openAccess(work) &&
            el(
              'p',
              { class: 'scope-note' },
              `Open access under ${openAccess(work).label}. The status comes from the license the publisher declared to Crossref.`,
            ),
          el(
            'p',
            { class: 'scope-note' },
            'This is the license of the publication itself. The metadata in this record comes from Crossref, which makes all its metadata open for reuse without restriction.',
          ),
        ),
      );
    container.append(
      section(
        'Reuse this record',
        el(
          'button',
          {
            class: 'text-button',
            onclick: () =>
              downloadText(JSON.stringify(work.raw, null, 2), {
                type: 'application/json',
                filename: 'crossref-record.json',
              }),
          },
          icon('download'),
          'Download source metadata',
        ),
      ),
    );
  }
  async function follow(doi) {
    const origin = readingPosition();
    following = true;
    followError = '';
    render();
    const id = ++generation;
    try {
      const next = await getWork(doi);
      if (id !== generation) return;
      trail.push(origin);
      show(next, { fromReference: true });
    } catch (error) {
      if (id !== generation) return;
      following = false;
      followError = error.message;
      render();
      root
        .querySelector(`[data-focus-key="${CSS.escape(origin.focusKey || '')}"]`)
        ?.focus({ preventScroll: true });
    }
  }
  function updateBanner() {
    const updates = reportableUpdates(getUpdates(work));
    if (!updates.length && !work.updateTo.length) return null;
    const serious = updates.some((update) => updateSeverity(update.type) === 'serious');
    const when = (date) =>
      Number.isNaN(Date.parse(date))
        ? ''
        : `, ${new Date(date).toLocaleDateString(undefined, { dateStyle: 'long', timeZone: 'UTC' })}`;
    const inspectButton = (doi, label, key) =>
      el(
        'button',
        {
          class: 'text-button',
          'data-focus-key': key,
          disabled: following,
          onclick: () => follow(doi),
        },
        label,
      );
    return el(
      'section',
      {
        class: `update-banner ${serious ? 'is-serious' : 'is-minor'}`,
        'aria-label': 'Update notices',
      },
      el(
        'p',
        { class: 'update-banner-title' },
        icon(serious ? 'circle-alert' : 'info'),
        updates.length ? updateLabel(updates[0]) : noticeLabel(work.updateTo[0]),
      ),
      el(
        'ul',
        {},
        updates.map((update, index) =>
          el(
            'li',
            {},
            `${updateLabel(update)}. Recorded by ${update.sources.map(sourceLabel).join(' and ') || 'a source Crossref does not name'}${when(update.date)}. `,
            inspectButton(update.doi, 'View the notice', `update-${index}`),
          ),
        ),
        work.updateTo.map((update, index) =>
          el(
            'li',
            {},
            `This record is a ${noticeLabel(update).toLowerCase()}. `,
            inspectButton(update.doi, 'View the publication it concerns', `notice-${index}`),
          ),
        ),
      ),
    );
  }
  const RELATION_LABELS = {
    'is-part-of': 'Part of',
    'has-part': 'Has part',
    'is-preprint-of': 'Preprint of',
    'has-preprint': 'Has preprint',
    'is-version-of': 'Version of',
    'has-version': 'Has version',
    'is-supplement-to': 'Supplement to',
    'is-supplemented-by': 'Supplemented by',
    'is-review-of': 'Review of',
    'is-reviewed-by': 'Reviewed by',
    'is-same-as': 'Same as',
  };
  function relationLabel(type) {
    if (RELATION_LABELS[type]) return RELATION_LABELS[type];
    const text = plainText(type.replaceAll('-', ' '));
    return text ? text[0].toUpperCase() + text.slice(1) : 'Related record';
  }
  // The book a chapter belongs to has its own section, so it is not listed a second time.
  function relationEntries() {
    const entries = [];
    for (const [type, values] of Object.entries(work.relations))
      for (const ref of Array.isArray(values) ? values : []) {
        const doi = normalizeDOI(ref?.id);
        const shownAsBook = type === 'is-part-of' && book && doi === work.partOf;
        if (doi && !shownAsBook) entries.push({ type, doi });
      }
    return entries;
  }
  async function loadRelated(entries) {
    if (related) return;
    const id = generation;
    related = { loading: true };
    try {
      related = { works: await getWorks(entries.map((entry) => entry.doi)) };
    } catch {
      related = { works: new Map() };
    }
    if (id === generation) render();
  }
  function relatedList(entries) {
    const shown = entries.slice(0, RELATED_LIMIT);
    return el(
      'div',
      {},
      entries.length > shown.length &&
        el(
          'p',
          { class: 'scope-note', role: 'status' },
          `Showing the first ${RELATED_LIMIT} of ${entries.length} related records.`,
        ),
      el(
        'ul',
        { class: 'related-list' },
        shown.map(({ type, doi }, index) => {
          const record = related?.works?.get(doi);
          return el(
            'li',
            {},
            el('p', { class: 'related-kind' }, relationLabel(type)),
            record
              ? [
                  el(
                    'button',
                    {
                      class: 'chapter-title',
                      'data-focus-key': `relation-${index}`,
                      disabled: following,
                      onclick: () => follow(doi),
                    },
                    displayTitle(record.title),
                  ),
                  el('p', { class: 'chapter-citation' }, citationLine(record, { doi: true })),
                ]
              : el(
                  'p',
                  { class: 'chapter-citation' },
                  externalLink(doi, doiURL(doi)),
                  related?.loading ? ' Loading details…' : ' Details not available from Crossref.',
                ),
          );
        }),
      ),
    );
  }
  async function findMatches(index, label) {
    const id = generation;
    matches.set(index, { loading: true });
    render();
    try {
      matches.set(index, { works: await findCitationMatches(label) });
    } catch (error) {
      matches.set(index, { error: error.message });
    }
    if (id === generation) render();
  }
  function matchBlock(index, label) {
    const found = matches.get(index);
    return el(
      'div',
      { class: 'reference-matches' },
      el(
        'button',
        {
          'data-focus-key': `reference-${index}`,
          disabled: found?.loading || following,
          onclick: () => findMatches(index, label),
        },
        found?.works ? 'Search Crossref again' : 'Find in Crossref',
      ),
      found?.loading && el('small', { role: 'status' }, 'Searching Crossref…'),
      found?.error && el('small', { role: 'alert' }, found.error),
      found?.works &&
        (found.works.length
          ? el(
              'div',
              {},
              el(
                'small',
                { role: 'status' },
                'Possible matches only. Check the title, authors and year before relying on one.',
              ),
              el(
                'ul',
                { class: 'reference-match-list' },
                found.works.map((candidate, position) =>
                  el(
                    'li',
                    {},
                    el(
                      'span',
                      {},
                      `${displayTitle(candidate.title)} · ${authorLine(candidate, 2)} · ${candidate.year || 'Date not supplied'}`,
                    ),
                    el(
                      'button',
                      {
                        'data-focus-key': `match-${index}-${position}`,
                        disabled: following,
                        onclick: () => follow(candidate.doi),
                      },
                      'View possible match',
                    ),
                  ),
                ),
              ),
            )
          : el('small', { role: 'status' }, 'Crossref returned no candidates for this citation.')),
    );
  }
  function connections(container) {
    if (work.citedBy !== null)
      container.append(
        section(
          'Cited by',
          el(
            'p',
            {},
            `${work.citedBy.toLocaleString()} citations recorded in Crossref. `,
            CITED_BY_NOTE,
          ),
        ),
      );
    container.append(
      section(
        'Follow connections',
        el(
          'p',
          {},
          'References and relationships come from this record. Their absence does not mean a work has no connections.',
        ),
      ),
    );
    if (following)
      container.append(
        el(
          'p',
          { class: 'citation-note', role: 'status' },
          'Retrieving the referenced publication…',
        ),
      );
    if (followError)
      container.append(
        el(
          'div',
          { class: 'notice notice-error', role: 'alert' },
          el('p', {}, followError, ' Use the DOI link to open its registration directly.'),
        ),
      );
    const refs = work.references;
    if (!refs.length)
      container.append(section('References', el('p', {}, 'No reference list available.')));
    else {
      const list = el('ol', { class: 'reference-list' });
      for (const [index, ref] of refs.slice(0, referenceLimit).entries()) {
        const doi = normalizeDOI(ref.DOI);
        const deposited =
          plainText(ref.unstructured) ||
          [
            plainText(ref.author),
            plainText(ref['article-title']),
            plainText(ref['journal-title']),
            plainText(String(ref.year || '')),
          ]
            .filter(Boolean)
            .join('. ') ||
          doi ||
          'Reference details not supplied';
        // Some publishers deposit their own list numbers inside the citation text.
        const label = deposited.replace(new RegExp(`^\\s*\\[?${index + 1}[.)\\]]\\s+(?=\\S)`), '');
        const searchable = !doi && label.length > 15 && label !== 'Reference details not supplied';
        list.append(
          el(
            'li',
            {},
            el('p', {}, label),
            searchable && matchBlock(index, label),
            doi &&
              el(
                'div',
                {},
                el(
                  'button',
                  {
                    'data-focus-key': `reference-${index}`,
                    disabled: following,
                    onclick: () => follow(doi),
                  },
                  'View reference',
                ),
                el('small', {}, externalLink(`https://doi.org/${doi}`, doiURL(doi))),
              ),
          ),
        );
      }
      const block = section(`References (${refs.length})`, list);
      if (refs.length > referenceLimit)
        block.append(
          el(
            'button',
            {
              class: 'text-button',
              'data-focus-key': 'more-references',
              onclick: () => {
                const firstNew = referenceLimit;
                referenceLimit += 20;
                render();
                root
                  .querySelector(`[data-focus-key="reference-${firstNew}"]`)
                  ?.focus({ preventScroll: true });
              },
            },
            'Show 20 more references',
          ),
        );
      container.append(block);
    }
    const entries = relationEntries();
    if (entries.length) {
      loadRelated(entries);
      container.append(section('Related records', relatedList(entries)));
    }
  }
  async function loadCitation() {
    const id = ++generation;
    citationLoading = true;
    citationError = '';
    citation = '';
    render();
    try {
      const text = await getCitation(work.doi, style);
      if (id !== generation) return;
      citation = text;
    } catch (error) {
      if (id !== generation) return;
      citationError = error.message;
    } finally {
      if (id === generation) {
        citationLoading = false;
        render();
      }
    }
  }
  function cite(container) {
    const select = el('select', {
      id: citationStyleId,
      'data-focus-key': 'citation-style',
      onchange: (e) => {
        style = e.target.value;
        loadCitation();
      },
    });
    for (const [value, label] of CITATION_STYLES)
      select.append(el('option', { value, selected: value === style }, label));
    const block = section(
      'Formatted citation',
      el(
        'div',
        { class: 'citation-controls' },
        el('label', { for: citationStyleId }, 'Style'),
        select,
      ),
    );
    if (citationLoading)
      block.append(el('p', { role: 'status' }, 'Retrieving a formatted citation from Crossref…'));
    else if (citationError)
      block.append(
        el(
          'div',
          { class: 'notice notice-error' },
          el(
            'div',
            {},
            el('p', {}, citationError),
            el('button', { class: 'button', onclick: loadCitation }, 'Retry citation'),
          ),
        ),
      );
    else if (citation) {
      const text = el('textarea', { readonly: true, 'aria-label': 'Formatted citation' }, citation);
      block.append(
        text,
        el(
          'button',
          {
            class: 'text-button',
            onclick: async () => {
              try {
                if (!navigator.clipboard) throw new Error('Clipboard unavailable');
                await navigator.clipboard.writeText(citation);
                notify('Citation copied.');
              } catch {
                text.focus();
                text.select();
                notify('Citation selected. Use your device’s Copy command.');
              }
            },
          },
          icon('copy'),
          'Copy citation',
        ),
      );
    }
    block.append(
      el(
        'p',
        { class: 'citation-note' },
        'Formatted by Crossref using CSL styles. Check the citation against your required style and the publication itself.',
      ),
    );
    container.append(block);
  }
  return {
    show,
    refresh: render,
    getCurrentWork: () => work,
    capture: () => (work ? { current: readingPosition(), trail } : null),
    restore(snapshot, { restorePage = true } = {}) {
      const next = normalizeWork(snapshot.current.raw);
      trail = Array.isArray(snapshot.trail)
        ? snapshot.trail.filter((entry) => normalizeDOI(entry?.raw?.DOI))
        : [];
      show(next, { fromReference: true, reading: snapshot.current, silent: true, restorePage });
    },
  };
}
