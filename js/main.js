import { PERIODS, TYPES, readQuery, queryString, authorLine, doiURL } from './data.js';
import { searchWorks, getWork, bibliographicTerms, DATE_BROWSE_LIMIT } from './crossref.js';
import { readSession, writeSession } from './session.js';
import { createInspector } from './inspector.js';
import { createCollectionStore } from './collection-store.js';
import { createCollectionTools } from './collection-tools.js';
import { el, icon, externalLink, emptyState, notify, skeletons } from './dom.js';

const $ = (id) => document.getElementById(id);
let storage;
try {
  storage = localStorage;
} catch {}
const collectionStore = createCollectionStore({ storage });
const saved = await collectionStore.ready;
const resumedSession = readSession();
const state = {
  view: 'explore',
  collection: saved.records,
  storageWarning: saved.warning,
  collectionQuery: '',
  exportSelection: new Set(),
  exportScope: 'all',
  exportFormat: 'ris',
  lastRemoved: null,
  query: readQuery(location.search),
  draft: readQuery(location.search),
  items: [],
  total: 0,
  nextCursor: null,
  selected: null,
  loading: false,
  retrievedAt: '',
  cached: false,
  error: '',
  requestId: 0,
  controller: null,
  doiLookup: false,
  resultQuery: null,
  errorRetryable: true,
  failedAppend: false,
  appending: false,
  browseLimited: false,
};

let initialized = false,
  restoringLocation = false;
let navigationGeneration = 0,
  locationController;
function cancelRestoration() {
  navigationGeneration++;
  locationController?.abort();
  restoringLocation = false;
}
function saveSession() {
  writeSession({
    view: state.view,
    draft: state.draft,
    selected: state.selected,
    collectionQuery: state.collectionQuery,
    selection: [...state.exportSelection],
    exportScope: state.exportScope,
    exportFormat: state.exportFormat,
    inspector: inspector.capture(),
  });
}
function updateURL({ push = false } = {}) {
  const params = new URLSearchParams(queryString(state.query));
  if (state.view === 'collection') params.set('view', 'collection');
  const work = inspector.getCurrentWork();
  if (work) params.set('record', work.doi);
  if ($('research').classList.contains('mobile-detail-open')) params.set('detail', '1');
  const next = `${location.pathname}?${params}${location.hash}`;
  if (next !== `${location.pathname}${location.search}${location.hash}`)
    history[initialized && push && !restoringLocation ? 'pushState' : 'replaceState'](
      null,
      '',
      next,
    );
  initialized = true;
  saveSession();
}
function syncControls() {
  $('searchInput').value = state.draft.q;
  $('periodSelect').value = state.draft.period;
  $('yearFrom').value = state.draft.from;
  $('yearTo').value = state.draft.to;
  $('typeFilter').value = state.draft.type;
  $('hasAbstract').checked = state.draft.abstract;
  $('hasOrcid').checked = state.draft.orcid;
  $('hasReferences').checked = state.draft.references;
  $('sortSelect').value = state.query.sort;
  updatePeriodHint();
  renderAppliedQuery();
  renderDraftStatus();
}
function readDraft() {
  return {
    q: $('searchInput').value.trim() || 'ancient egypt',
    period: $('periodSelect').value,
    from: $('yearFrom').value,
    to: $('yearTo').value,
    type: $('typeFilter').value,
    abstract: $('hasAbstract').checked,
    orcid: $('hasOrcid').checked,
    references: $('hasReferences').checked,
    sort: state.query.sort,
  };
}
function renderDraftStatus() {
  const pending = queryString(state.draft) !== queryString(state.resultQuery || state.query);
  $('pendingQuery').hidden = !pending || state.loading || state.view === 'collection';
}
function captureDraft() {
  state.draft = readDraft();
  renderDraftStatus();
  saveSession();
}
function renderAppliedQuery() {
  const query = state.resultQuery || state.query;
  $('effectiveQuery').textContent = state.doiLookup
    ? `Exact DOI lookup: ${query.q}. Topic and publication refinements do not apply.`
    : `Keywords sent to Crossref: ${bibliographicTerms(query)}`;
  const period = PERIODS.find((p) => p.id === query.period);
  const chips = [
    period && `Period keywords: ${period.name}`,
    query.type && TYPES.get(query.type),
    query.from && `From ${query.from}`,
    query.to && `To ${query.to}`,
    query.abstract && 'Has abstract',
    query.orcid && 'Has ORCID',
    query.references && 'Has references',
  ].filter(Boolean);
  $('activeQuery').replaceChildren(
    ...chips.map((text) => el('span', { class: 'query-chip' }, text)),
  );
  $('activeQuery').hidden = state.view === 'collection' || chips.length === 0;
}
const inspector = createInspector($('inspector'), {
  onClose: closeInspector,
  onSave: toggleSave,
  isSaved: (id) => state.collection.has(id),
  onChange: saveSession,
  onNavigate: () => {
    cancelRestoration();
    updateURL({ push: true });
  },
});
const collectionTools = createCollectionTools($('collectionTools'), {
  getState: () => ({
    records: state.collection,
    visible: state.view === 'collection' ? visibleWorks() : [],
    selection: state.exportSelection,
    query: state.collectionQuery,
    scope: state.exportScope,
    format: state.exportFormat,
  }),
  onQuery(query) {
    state.collectionQuery = query;
    reconcileCollection();
    renderList();
    renderStatus();
    updateURL();
  },
  onSelect(ids) {
    if (!ids.length) state.exportSelection.clear();
    else {
      for (const id of ids) state.exportSelection.add(id);
      state.exportScope = 'selected';
    }
    renderList();
    collectionTools.sync();
    saveSession();
  },
  onPreferences({ scope, format }) {
    if (scope) state.exportScope = scope;
    if (format) state.exportFormat = format;
    saveSession();
  },
  async onImport(imported) {
    const result = await collectionStore.change({ import: imported });
    state.collection = result.records;
    state.storageWarning = result.warning;
    reconcileCollection();
    renderList();
    renderStatus();
    return `Imported collection. ${state.collection.size} publications saved. Records are matched by DOI.${result.warning ? ' Changes are kept for this visit only.' : ''}`;
  },
});
function reconcileCollection() {
  for (const id of state.exportSelection)
    if (!state.collection.has(id)) state.exportSelection.delete(id);
  if (state.view !== 'collection') return;
  const works = visibleWorks();
  if (!works.some((work) => work.id === state.selected)) {
    state.selected = works[0]?.id || null;
    renderInspector(works[0]);
  }
}
function visibleWorks() {
  if (state.view === 'explore') return state.items;
  const query = state.collectionQuery.toLowerCase();
  return [...state.collection.values()]
    .map((x) => x.work)
    .filter(
      (work) =>
        !query ||
        [work.title, authorLine(work, 100), work.abstract, work.container]
          .join(' ')
          .toLowerCase()
          .includes(query),
    );
}
const saving = new Set();
async function toggleSave(work) {
  if (saving.has(work.id)) return;
  const focusedRecord = document.activeElement?.closest('.result-row')?.dataset.record;
  const removing = state.collection.has(work.id);
  const removedEntry = state.collection.get(work.id);
  saving.add(work.id);
  try {
    const result = await collectionStore.change(
      removing ? { remove: work.id } : { add: { work, savedAt: new Date().toISOString() } },
    );
    state.collection = result.records;
    state.storageWarning = result.warning;
    if (removing) state.lastRemoved = removedEntry;
    reconcileCollection();
  } catch (error) {
    notify(error.message);
    return;
  } finally {
    saving.delete(work.id);
  }
  notify(
    !state.storageWarning
      ? removing
        ? 'Publication removed from your collection.'
        : 'Publication saved to your collection.'
      : 'Changed for this visit. Export your collection to keep a copy.',
  );
  renderList();
  renderStatus();
  inspector.refresh();
  if (focusedRecord)
    (
      $('resultList').querySelector(`[data-record="${CSS.escape(focusedRecord)}"] .save-button`) ||
      $('undoRemoval')
    )?.focus({ preventScroll: true });
}
function setView(view, { navigate = true, syncURL = true, load = true } = {}) {
  if (navigate) cancelRestoration();
  if (view !== 'collection') collectionTools.cancel();
  $('research').classList.toggle('collection-view', view === 'collection');
  document.body.classList.toggle('is-collection', view === 'collection');
  state.view = view;
  renderDraftStatus();
  $('research').classList.remove('mobile-detail-open');
  $('collectionNav').setAttribute('aria-pressed', String(view === 'collection'));
  $('exploreNav').setAttribute('aria-pressed', String(view === 'explore'));
  $('refinements').hidden = view === 'collection';
  $('sortSelect').parentElement.hidden = view === 'collection';
  $('activeQuery').hidden = view === 'collection' || !$('activeQuery').childElementCount;
  const heading = view === 'collection' ? 'h1' : 'h2';
  const title = view === 'collection' ? 'Your collection' : 'Publications';
  if ($('resultsTitle').tagName.toLowerCase() !== heading)
    $('resultsTitle').replaceWith(
      el(heading, { id: 'resultsTitle', class: 'results-title' }, title),
    );
  else $('resultsTitle').textContent = title;
  $('collectionTools').hidden = view !== 'collection';
  $('searchExplanation').hidden = view === 'collection';
  if (view === 'collection') renderCollectionTools();
  const work = visibleWorks().find((w) => w.id === state.selected) || visibleWorks()[0];
  state.selected = work?.id || null;
  renderInspector(work);
  renderList();
  renderStatus();
  if (syncURL) updateURL({ push: navigate });
  if (view === 'explore' && !state.resultQuery && !state.loading && load) runSearch();
}
function renderCollectionTools() {
  collectionTools.sync();
}
function renderInspector(work) {
  inspector.show(work);
}
function closeInspector() {
  $('research').classList.remove('mobile-detail-open');
  $('resultList')
    .querySelector(`[data-record="${CSS.escape(state.selected || '')}"] .result-open`)
    ?.focus();
  updateURL();
}
function selectWork(work) {
  cancelRestoration();
  state.selected = work.id;
  renderList();
  renderInspector(work);
  $('inspector').scrollTop = 0;
  $('inspector').focus({ preventScroll: true });
  if (matchMedia('(max-width:999px)').matches) {
    $('research').classList.add('mobile-detail-open');
    $('inspector').focus();
    $('research').scrollIntoView({ block: 'start' });
  }
  updateURL({ push: true });
}
function renderList() {
  const list = $('resultList');
  list.setAttribute('aria-busy', String(state.view === 'explore' && state.loading));
  if (state.view === 'explore' && state.loading && !state.items.length) {
    list.replaceChildren(...skeletons());
    return;
  }
  if (!visibleWorks().length) {
    if (state.view === 'collection') {
      const empty = emptyState(
        state.collection.size
          ? 'No saved publications match.'
          : 'Your next bibliography starts here.',
        state.collection.size
          ? 'Try another title, author, or keyword.'
          : 'Save useful publications from Explore. They will stay here when you return.',
        'library-big',
      );
      empty.append(
        el(
          'button',
          {
            class: 'button',
            onclick: () => {
              if (state.collection.size) {
                state.collectionQuery = '';
                reconcileCollection();
                renderList();
                renderStatus();
                updateURL();
                $('collectionSearch').focus();
              } else setView('explore');
            },
          },
          state.collection.size ? 'Clear collection search' : 'Explore publications',
        ),
      );
      list.replaceChildren(el('li', {}, empty));
      return;
    }
    list.replaceChildren(
      el(
        'li',
        {},
        emptyState(
          state.error ? 'Search is unavailable' : 'No publications found.',
          state.error
            ? 'Your search is still here. Retry when you are ready.'
            : 'Try a broader topic, another spelling, or fewer filters. Crossref may not contain the scholarship you need.',
        ),
      ),
    );
    return;
  }
  list.replaceChildren(
    ...visibleWorks().map((work) => {
      const title = el(
        'button',
        {
          class: 'result-open',
          onclick: () => selectWork(work),
          'aria-label': `Inspect ${work.title}`,
        },
        work.title,
      );
      const badges = [
        work.abstract && ['file-text', 'Abstract'],
        work.authors.some((a) => a.orcid) && ['user-round', 'ORCID'],
        work.references.length > 0 && ['network', `${work.references.length} references`],
      ].filter(Boolean);
      return el(
        'li',
        {
          class: `result-row${state.selected === work.id ? ' is-selected' : ''}`,
          'data-record': work.id,
        },
        el(
          'div',
          { class: 'result-top' },
          state.view === 'collection' &&
            el(
              'label',
              { class: 'select-publication' },
              el('input', {
                type: 'checkbox',
                checked: state.exportSelection.has(work.id),
                'aria-label': `Select publication: ${work.title}`,
                onchange: (event) => {
                  if (event.target.checked) {
                    state.exportSelection.add(work.id);
                    state.exportScope = 'selected';
                  } else state.exportSelection.delete(work.id);
                  collectionTools.sync();
                  saveSession();
                },
              }),
            ),
          el(state.view === 'collection' ? 'h2' : 'h3', {}, title),
          el(
            'button',
            {
              class: 'save-button',
              'aria-pressed': String(state.collection.has(work.id)),
              'aria-label': `${state.collection.has(work.id) ? 'Remove from' : 'Save to'} collection: ${work.title}`,
              onclick: () => toggleSave(work),
            },
            icon(state.collection.has(work.id) ? 'bookmark-check' : 'bookmark'),
            el('span', {}, state.collection.has(work.id) ? 'Saved' : 'Save'),
          ),
        ),
        el(
          'p',
          { class: 'result-meta' },
          [authorLine(work), work.year || 'Date not supplied', work.container || work.publisher]
            .filter(Boolean)
            .join(' · '),
        ),
        work.abstract && el('p', { class: 'result-snippet' }, work.abstract),
        el(
          'div',
          { class: 'metadata-badges' },
          el('span', {}, work.typeLabel),
          badges.map(([name, label]) => el('span', { class: 'metadata-badge' }, icon(name), label)),
        ),
      );
    }),
  );
}
function renderStatus() {
  $('collectionUndo').hidden = !state.lastRemoved;
  if (state.lastRemoved)
    $('removedTitle').textContent = `Removed “${state.lastRemoved.work.title}”.`;
  $('collectionCount').textContent = state.collection.size;
  if (state.view === 'collection') {
    collectionTools.sync();
    $('resultCount').textContent =
      `${visibleWorks().length} of ${state.collection.size} saved publications`;
    $('scopeNote').textContent =
      'Your collection contains deposited records, not downloaded full texts.';
    $('resultsFooter').replaceChildren();
    $('requestNotice').hidden = !state.storageWarning;
    if (state.storageWarning)
      $('requestNotice').replaceChildren(
        el('div', { class: 'notice' }, icon('circle-alert'), el('p', {}, state.storageWarning)),
      );
    return;
  }
  const previous =
    state.items.length &&
    state.resultQuery &&
    queryString(state.resultQuery) !== queryString(state.query);
  $('resultCount').textContent = state.loading
    ? state.appending
      ? 'Loading more publications…'
      : 'Searching Crossref…'
    : `${previous ? 'Previous results: ' : ''}${state.items.length.toLocaleString()} loaded${state.total ? ` · ${state.total.toLocaleString()} Crossref candidates` : ''}`;
  const resultQuery = state.resultQuery || state.query;
  const ranking =
    resultQuery.sort === 'relevance'
      ? 'Ranked by Crossref'
      : `Sorted by publication date, ${resultQuery.sort === 'oldest' ? 'oldest' : 'newest'} first`;
  $('scopeNote').textContent = state.doiLookup
    ? 'DOI lookup opens one exact Crossref record; topic and publication filters do not apply.'
    : `${previous ? `Showing the last successful search for “${resultQuery.q}”. ` : `Results for “${resultQuery.q}”. `}${ranking}${state.retrievedAt ? ` · ${state.cached ? 'cached' : 'retrieved'} ${new Date(state.retrievedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}. Relevance and coverage vary.${resultQuery.sort !== 'relevance' ? ` Date-sorted browsing covers the first ${DATE_BROWSE_LIMIT.toLocaleString()} candidates; narrow your search for more focused results.` : ''}`;
  const notice = $('requestNotice');
  notice.hidden = !state.error;
  if (state.error)
    notice.replaceChildren(
      el(
        'div',
        { class: 'notice notice-error' },
        icon('circle-alert'),
        el(
          'div',
          {},
          el('p', {}, state.error),
          el(
            'button',
            {
              class: 'button',
              onclick: () =>
                state.errorRetryable ? runSearch(state.failedAppend) : $('searchInput').focus(),
            },
            state.errorRetryable ? 'Retry search' : 'Edit search',
          ),
        ),
      ),
    );
  const footer = $('resultsFooter');
  footer.replaceChildren();
  if (state.nextCursor && !previous)
    footer.append(
      el(
        'button',
        { class: 'button', disabled: state.loading, onclick: () => runSearch(true) },
        state.loading ? 'Loading…' : 'Load 25 more publications',
      ),
      el(
        'p',
        { class: 'scope-note' },
        'Only loaded records are shown. Search more specifically to improve relevance.',
      ),
    );
  if (state.browseLimited && !previous)
    footer.append(
      el(
        'p',
        { class: 'scope-note' },
        'You have reached the publication-date browsing limit. Narrow the publication years or topic, or switch to relevance.',
      ),
    );
  $('sortSelect').disabled = state.loading;
}
async function runSearch(append = false) {
  if (state.view !== 'explore') setView('explore', { syncURL: false, load: false });
  state.controller?.abort();
  const controller = new AbortController();
  state.controller = controller;
  const requestId = ++state.requestId;
  state.loading = true;
  state.error = '';
  state.appending = append;
  state.failedAppend = append;
  state.errorRetryable = true;
  const requestedQuery = { ...state.query };
  renderAppliedQuery();
  renderDraftStatus();
  updateURL({ push: initialized });
  renderList();
  renderStatus();
  try {
    const result = await searchWorks(requestedQuery, {
      cursor: append ? state.nextCursor : '*',
      signal: controller.signal,
    });
    if (requestId !== state.requestId) return;
    const existing = new Set(append ? state.items.map((w) => w.id) : []);
    const added = result.items.filter((w) => !existing.has(w.id));
    state.items = append ? [...state.items, ...added] : added;
    state.total = result.total;
    state.nextCursor = added.length ? result.nextCursor : null;
    state.retrievedAt = result.retrievedAt;
    state.cached = result.cached;
    state.doiLookup = result.doiLookup;
    state.browseLimited = result.browseLimited;
    state.resultQuery = requestedQuery;
    renderAppliedQuery();
    if (!append) {
      const selected = state.items.find((work) => work.id === state.selected) || state.items[0];
      state.selected = selected?.id || null;
      renderInspector(selected);
      $('research').classList.remove('mobile-detail-open');
    }
  } catch (error) {
    if (controller.signal.aborted || requestId !== state.requestId) return;
    state.errorRetryable = error.retryable !== false;
    state.error =
      error.name === 'TimeoutError'
        ? 'Crossref took too long to respond. Retry your search.'
        : error.message === 'Failed to fetch'
          ? 'We could not reach Crossref. Check your connection and retry.'
          : error.message;
  } finally {
    if (requestId === state.requestId) {
      state.loading = false;
      renderList();
      renderStatus();
      renderDraftStatus();
      updateURL();
    }
  }
}
function updatePeriodHint() {
  const period = PERIODS.find((p) => p.id === $('periodSelect').value);
  $('periodDates').textContent = period?.dates || '';
  $('periodDates').hidden = !period;
}
for (const period of PERIODS) {
  $('periodSelect').append(el('option', { value: period.id }, period.name));
}
$('periodSelect').addEventListener('change', updatePeriodHint);
$('sortSelect').addEventListener('change', (e) => {
  cancelRestoration();
  state.query.sort = e.target.value;
  state.draft = readDraft();
  runSearch();
});
function submitSearch(e) {
  e.preventDefault();
  for (const control of $('filterForm').elements) {
    if (!control.checkValidity()) {
      $('refinements').open = true;
      control.reportValidity();
      return;
    }
  }
  const from = $('yearFrom').value;
  const to = $('yearTo').value;
  if (from && to && Number(from) > Number(to)) {
    $('refinements').open = true;
    $('filterError').textContent = 'The start year must come before the end year.';
    $('filterError').hidden = false;
    $('filterError').setAttribute('tabindex', '-1');
    $('filterError').focus();
    return;
  }
  $('filterError').hidden = true;
  cancelRestoration();
  state.draft = readDraft();
  state.query = { ...state.draft };
  runSearch();
}
$('searchForm').addEventListener('submit', submitSearch);
$('filterForm').addEventListener('submit', submitSearch);
for (const form of [$('searchForm'), $('filterForm')]) {
  form.addEventListener('input', captureDraft);
  form.addEventListener('change', captureDraft);
}
$('discardDraft').addEventListener('click', () => {
  state.draft = { ...(state.resultQuery || state.query) };
  state.query = { ...state.draft };
  state.error = '';
  syncControls();
  renderStatus();
  updateURL();
  $('searchInput').focus();
});
$('clearFilters').addEventListener('click', (e) => {
  $('filterForm').reset();
  updatePeriodHint();
  submitSearch(e);
});
$('aboutToggle').addEventListener('click', () => {
  const open = $('aboutPanel').hidden;
  $('aboutPanel').hidden = !open;
  $('aboutToggle').setAttribute('aria-expanded', String(open));
});
$('exploreNav').addEventListener('click', () => setView('explore'));
$('collectionNav').disabled = false;
$('collectionNav').addEventListener('click', () => setView('collection'));
$('dismissUndo').addEventListener('click', () => {
  state.lastRemoved = null;
  renderStatus();
  $('resultsTitle').setAttribute('tabindex', '-1');
  $('resultsTitle').focus();
});
$('undoRemoval').addEventListener('click', async () => {
  const entry = state.lastRemoved;
  if (!entry || $('undoRemoval').disabled) return;
  $('undoRemoval').disabled = true;
  try {
    const result = await collectionStore.change({ add: entry });
    state.collection = result.records;
    state.storageWarning = result.warning;
    state.lastRemoved = null;
    reconcileCollection();
    renderList();
    renderStatus();
    inspector.refresh();
    $('resultList')
      .querySelector(`[data-record="${CSS.escape(entry.work.id)}"] .save-button`)
      ?.focus();
    notify(
      result.warning
        ? 'Restored for this visit. Export to keep a copy.'
        : 'Publication restored to your collection.',
    );
  } catch (error) {
    notify(error.message);
  } finally {
    $('undoRemoval').disabled = false;
  }
});
collectionStore.subscribe(({ records, warning }) => {
  state.collection = records;
  state.storageWarning = warning;
  reconcileCollection();
  renderList();
  renderStatus();
  inspector.refresh();
});
async function restoreLocation(resume = null) {
  locationController?.abort();
  const controller = new AbortController();
  locationController = controller;
  const navigation = ++navigationGeneration;
  restoringLocation = true;
  const params = new URLSearchParams(location.search);
  const record = params.get('record');
  const detail = params.get('detail') === '1';
  try {
    state.query = readQuery(location.search);
    state.draft = resume?.draft ? readQuery(queryString(resume.draft)) : { ...state.query };
    state.collectionQuery =
      typeof resume?.collectionQuery === 'string' ? resume.collectionQuery : '';
    state.exportSelection = new Set(
      Array.isArray(resume?.selection)
        ? resume.selection.filter((id) => state.collection.has(id))
        : [],
    );
    state.exportScope = ['all', 'matching', 'selected'].includes(resume?.exportScope)
      ? resume.exportScope
      : 'all';
    state.exportFormat = ['ris', 'bibtex', 'csv', 'json'].includes(resume?.exportFormat)
      ? resume.exportFormat
      : 'ris';
    state.selected = resume?.selected || record;
    syncControls();
    const view = params.get('view') === 'collection' ? 'collection' : 'explore';
    setView(view, { navigate: false, syncURL: false, load: false });
    if (
      view === 'explore' &&
      (!state.resultQuery || queryString(state.resultQuery) !== queryString(state.query))
    )
      await runSearch();
    if (navigation !== navigationGeneration) return;
    if (resume?.inspector) inspector.restore(resume.inspector);
    else if (record) {
      const work =
        state.collection.get(record)?.work ||
        state.items.find((work) => work.id === record) ||
        (await getWork(record, { signal: controller.signal }));
      if (navigation !== navigationGeneration) return;
      renderInspector(work);
      state.selected = work.id;
      renderList();
    }
    if (detail && matchMedia('(max-width:999px)').matches)
      $('research').classList.add('mobile-detail-open');
    else $('research').classList.remove('mobile-detail-open');
  } catch {
    if (navigation === navigationGeneration)
      notify(
        'The reading position could not be restored. Your saved collection is still available.',
      );
  } finally {
    if (navigation === navigationGeneration) {
      restoringLocation = false;
      updateURL();
    }
  }
}
window.addEventListener('popstate', () => restoreLocation());
window.addEventListener('pagehide', saveSession);
let positionTimer;
const savePosition = () => {
  clearTimeout(positionTimer);
  positionTimer = setTimeout(saveSession, 180);
};
$('inspector').addEventListener('scroll', savePosition, { passive: true });
$('inspector').addEventListener('focusin', savePosition);
window.addEventListener('scroll', savePosition, { passive: true });
const filterLayout = matchMedia('(min-width:1300px)');
$('refinements').open = filterLayout.matches;
filterLayout.addEventListener('change', (event) => {
  $('refinements').open = event.matches;
});
syncControls();
await restoreLocation(resumedSession);
