import { readPlaceState, writePlaceState } from './place-state.js';
import { createChangeReview } from './changes.js';
import { createPlaces } from './places.js';
import { createResearch } from './research.js';
import { importResearch } from './research-store.js';
import { createVisualize } from './visualize.js';
import {
  PERIODS,
  readQuery,
  queryString,
  authorLine,
  normalizeWork,
  normalizeDOI,
} from './data.js';
import { filterChips, filterEntries, readFilterControls, writeFilterControls } from './filters.js';
import {
  searchWorks,
  getWork,
  addedSearchTerms,
  bibliographicTerms,
  DATE_BROWSE_LIMIT,
} from './crossref.js';
import { readSession, writeSession } from './session.js';
import { createInspector } from './inspector.js';
import { createCollectionStore } from './collection-store.js';
import { createCollectionTools } from './collection-tools.js';
import { createResultRow } from './result-row.js';
import { renderSearchFooter, renderSearchNotice } from './search-status.js';
import { VIEW_CONFIG } from './view-config.js';
import { createSearchHandoff } from './search-handoff.js';
import { BREAKPOINTS } from './breakpoints.js';
import { el, icon, emptyState, notify, skeletons } from './dom.js';

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
  directRecord: null,
  errorRetryable: true,
  failedAppend: false,
  appending: false,
  browseLimited: false,
};

const searchHandoff = createSearchHandoff();

let initialized = false,
  restoringLocation = false;
let placeReturnContext = null;
let chartReturn = null;
let chartPosition = null;
let chartSearch = false;
const workspacePositions = new Map();

function captureWorkspace() {
  return {
    scrollY: window.scrollY,
    selected: state.selected,
    outsideList: Boolean(
      state.selected && !visibleWorks().some((work) => work.id === state.selected),
    ),
    inspector: inspector.capture(),
    mobileDetail: $('research').classList.contains('mobile-detail-open'),
  };
}
function focusHeading(heading) {
  heading?.focus({ preventScroll: true });
  heading?.scrollIntoView({ block: 'start', behavior: 'instant' });
}
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
    places: places.capture(),
    placesOrigin: state.view === 'places' ? placeReturnContext : null,
  });
}
function updateURL({ push = false } = {}) {
  const params = new URLSearchParams(state.query.q ? queryString(state.query) : '');
  if (state.view !== 'explore') params.set('view', state.view);
  if (state.view === 'places') {
    writePlaceState(params, places.location());
  }
  if (state.view === 'explore' || state.view === 'collection') {
    const work = inspector.getCurrentWork();
    if (work && (state.query.q || state.view === 'collection')) params.set('record', work.doi);
    else if (state.view === 'explore' && state.directRecord)
      params.set('record', work?.doi || state.directRecord);
    if ($('research').classList.contains('mobile-detail-open')) params.set('detail', '1');
  }
  const next = `${location.pathname}${params.size ? `?${params}` : ''}${location.hash}`;
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
  $('searchInput').setCustomValidity('');
  $('navSearchInput').setCustomValidity('');
  $('searchInput').value = state.draft.q;
  $('navSearchInput').value = state.draft.q;
  $('searchField').value = state.draft.field || '';
  const extraType = document.querySelector(
    '#morePublicationTypes input[value="' + CSS.escape(state.draft.type || '') + '"]',
  );
  if (extraType) setMoreTypes(true);
  writeFilterControls(document, state.draft);
  $('sortSelect').value = state.query.sort;
  updatePeriodHint();
  renderAppliedQuery();
  renderDraftStatus();
}
function readDraft() {
  const filters = readFilterControls(document);
  return {
    q: $('searchInput').value.trim(),
    ...($('searchField').value ? { field: $('searchField').value } : {}),
    container: state.draft.container || '',
    period: filters.period,
    context: filters.context,
    from: filters.from,
    to: filters.to,
    type: filters.type,
    abstract: filters.abstract,
    orcid: filters.orcid,
    references: filters.references,
    sort: state.query.sort,
  };
}
function renderDraftStatus() {
  const applied = (state.error && state.resultQuery) || state.query;
  const pending = state.draft.q !== applied.q || state.draft.field !== applied.field;
  $('pendingQuery').hidden = !pending || !state.query.q;
  $('navSearchDraft').hidden = !pending || !state.query.q;
  const explore = state.view === 'explore';
  $('primarySearchSubmit').textContent = explore ? 'Search' : 'Search in Explore';
  $('navSearchForm')
    .querySelector('button')
    .setAttribute('aria-label', explore ? 'Search Crossref' : 'Search Crossref and open Explore');
  $('yearPending').hidden =
    state.draft.from === state.query.from && state.draft.to === state.query.to;
  const mode = $('searchField').value;
  $('navSearchInput').placeholder =
    mode === 'author'
      ? 'Search author names'
      : mode === 'doi'
        ? 'Enter a DOI'
        : 'Search publications';
  $('searchScope').textContent =
    mode === 'doi'
      ? 'Look up one exact Crossref record. Publication refinements do not apply.'
      : mode === 'author'
        ? 'Search author names in Crossref, with your selected research context.'
        : 'Search publication metadata in Crossref. Paste a DOI for an exact record.';
}
function captureDraft() {
  state.draft = readDraft();
  renderDraftStatus();
  saveSession();
}
function focusRefinementAction() {
  const target = $('clearFilters').disabled
    ? document.querySelector('.current-filters > summary')
    : $('clearFilters');
  target.focus({ preventScroll: true });
}
function applyRefinement(patch) {
  cancelRestoration();
  state.query = { ...state.query, ...patch };
  state.draft = { ...state.draft, ...patch };
  syncControls();
  runSearch();
}
function renderAppliedQuery() {
  const query = chartSearch && state.loading ? state.query : state.resultQuery || state.query;
  $('effectiveQuery').textContent = state.doiLookup
    ? `Exact DOI lookup: ${query.q}. Topic and publication refinements do not apply.`
    : query.field === 'author'
      ? `Author names: ${query.q}. Added bibliographic terms: ${addedSearchTerms(query) || 'none'}.`
      : `Ranking context sent to Crossref: ${bibliographicTerms(query)}`;
  const current = state.query;
  const doi = Boolean(normalizeDOI(current.q)) || current.field === 'doi';
  const entries = doi ? [] : filterEntries(current);
  if (!doi && !current.period && addedSearchTerms(current))
    entries.unshift({ key: 'context', label: 'Added terms: ancient Egypt' });
  const focusedKey = $('currentFilters').contains(document.activeElement)
    ? document.activeElement?.getAttribute('data-filter-key')
    : null;
  $('currentFilters').replaceChildren(
    el(
      'p',
      { class: 'current-search' },
      `${current.field === 'author' ? 'Author' : doi ? 'DOI' : 'All metadata'}: ${current.q}`,
    ),
    ...(entries.length
      ? entries.map(({ key, label }) =>
          el(
            'div',
            { class: 'current-filter' },
            el('span', {}, label),
            el(
              'button',
              {
                type: 'button',
                class: 'remove-filter',
                'data-filter-key': key,
                'aria-label':
                  key === 'context'
                    ? 'Remove added ancient Egypt terms'
                    : `Remove filter: ${label}`,
                onclick: () => {
                  applyRefinement({
                    [key]: ['context', 'abstract', 'orcid', 'references'].includes(key)
                      ? false
                      : '',
                  });
                  focusRefinementAction();
                },
              },
              icon('x'),
            ),
          ),
        )
      : [
          el(
            'p',
            { class: 'filter-help' },
            doi ? 'Refinements do not apply to DOI lookups.' : 'No refinements applied.',
          ),
        ]),
  );
  if (focusedKey)
    $('currentFilters')
      .querySelector(`[data-filter-key="${focusedKey}"]`)
      ?.focus({ preventScroll: true });
  $('filterCount').textContent = entries.length ? `(${entries.length})` : '';
  $('clearFilters').disabled = !entries.length;
  $('activeQuery').replaceChildren(
    ...filterChips(query).map((text) => el('span', { class: 'query-chip' }, text)),
  );
  $('activeQuery').hidden =
    state.view === 'collection' ||
    Boolean(normalizeDOI(query.q)) ||
    query.field === 'doi' ||
    !$('activeQuery').childElementCount;
}
const inspector = createInspector($('inspector'), {
  onClose: closeInspector,
  onSave: toggleSave,
  onPlace: (place) => {
    placeReturnContext = { view: state.view, ...captureWorkspace() };
    setView('places', {
      placeOptions: {
        place: place.id,
        mode: 'discover',
        origin: placeOrigin(placeReturnContext),
        focus: true,
      },
    });
  },
  isSaved: (id) => state.collection.has(id),
  savedLabel: 'Remove from collection',
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
  onMap() {
    placeReturnContext = { view: 'collection', mapCollection: true, ...captureWorkspace() };
    setView('places', {
      placeOptions: {
        place: '',
        mode: 'collection',
        status: 'all',
        origin: placeOrigin(placeReturnContext),
        focus: true,
      },
    });
  },
  onReview: () => changeReview.run(),
  onDiscover: () => researcher.run(),
  async onImport(imported, reviewedImport, reviewedResearch) {
    const result = await collectionStore.change({ import: imported.records, reviewedImport });
    state.collection = result.records;
    const research = importResearch(imported.research, reviewedResearch);
    const kept = [...imported.records].filter(
      ([id, entry]) => result.records.get(id) !== entry,
    ).length;
    state.storageWarning = result.warning;
    reconcileCollection();
    const selectedImport = imported.records.get(state.selected);
    if (
      state.view === 'collection' &&
      selectedImport &&
      result.records.get(state.selected) === selectedImport
    )
      renderInspector(selectedImport.work);
    renderList();
    renderStatus();
    return [
      `Import complete. ${state.collection.size} publications in your collection.`,
      kept || research.kept
        ? `Kept ${kept} existing publication entries and ${research.kept} existing research decisions.`
        : '',
      research.skipped
        ? `Skipped ${research.skipped} invalid research ${research.skipped === 1 ? 'decision' : 'decisions'}.`
        : '',
      result.warning || research.sessionOnly ? 'Some changes are kept for this visit only.' : '',
    ]
      .filter(Boolean)
      .join(' ');
  },
});
const changeReview = createChangeReview(collectionTools.changeReview, {
  getRecords: () => state.collection,
  onInspect: selectWork,
  onAccept: async (work, savedAt, expectedRaw) => {
    const result = await collectionStore.change({ update: { work, savedAt }, expectedRaw });
    state.collection = result.records;
    state.storageWarning = result.warning;
    renderList();
    renderStatus();
    if (state.view === 'collection' && inspector.getCurrentWork()?.id === work.id)
      renderInspector(work);
  },
});
const researcher = createResearch(collectionTools.research, {
  getSeeds: () =>
    [...state.collection.values()]
      .map((entry) => entry.work)
      .filter((work) => !state.exportSelection.size || state.exportSelection.has(work.id)),
  getSaved: () => state.collection,
  onSave: async (work) => {
    if (!state.collection.has(work.id)) await toggleSave(work);
    if (!state.collection.has(work.id))
      throw new Error(
        'This reference could not be saved. Try again or export your collection to free space.',
      );
  },
  onInspect: selectWork,
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
  const query = state.collectionQuery.trim().toLowerCase();
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
const places = createPlaces($('places'), {
  initialSession: resumedSession?.places,
  getSaved: () => state.collection,
  onSave: toggleSave,
  getRemoved: () => state.lastRemoved,
  onUndo: restoreRemoved,
  onLocation: (_, { push = true } = {}) => updateURL({ push }),
  onSession: saveSession,
});
function placeOrigin(context) {
  if (!context?.mapCollection && !context?.inspector?.current?.raw) return null;
  const mapCollection = context.mapCollection;
  return {
    work: mapCollection ? null : normalizeWork(context.inspector.current.raw),
    label: mapCollection ? 'Back to collection' : 'Back to publication',
    async return() {
      placeReturnContext = null;
      places.clearOrigin();
      workspacePositions.set(context.view, context);
      setView(context.view, { load: false, syncURL: false });
      const navigation = navigationGeneration;
      const needsSearch = state.view === 'explore' && Boolean(state.query.q) && !state.resultQuery;
      if (needsSearch) await runSearch();
      if (navigation !== navigationGeneration || state.view !== context.view) return;
      if (mapCollection) {
        $('mapCollection').focus({ preventScroll: true });
        window.scrollTo({ top: context.scrollY || 0, behavior: 'instant' });
      } else {
        state.selected = context.selected;
        renderList();
        if (context.mobileDetail) $('research').classList.add('mobile-detail-open');
        inspector.restore(context.inspector);
      }
      updateURL({ push: !needsSearch });
    },
  };
}
const visualizer = createVisualize($('visualize'), {
  onExplore() {
    setView('explore');
    $('searchInput').focus();
  },
  onRefine(query, filter, trigger) {
    chartReturn = { trigger, scrollY: window.scrollY };
    chartSearch = true;
    state.query = { ...query, ...filter };
    Object.assign(state.draft, filter);
    syncControls();
    setView('explore', { load: false, syncURL: false });
    runSearch();
    focusHeading($('resultsTitle'));
  },
});
$('backToChart').addEventListener('click', () => {
  const { trigger, scrollY } = chartReturn;
  setView('visualize', { resumeChart: true });
  window.scrollTo({ top: scrollY, behavior: 'instant' });
  trigger.focus({ preventScroll: true });
});
$('visualizeResults').addEventListener('click', () => {
  setView('visualize');
  focusHeading($('visualize').querySelector('h2'));
});
function setView(
  view,
  { navigate = true, syncURL = true, load = true, placeOptions, resumeChart = false } = {},
) {
  const previousView = state.view;
  const switching = view !== previousView;
  if (navigate && !switching && !placeOptions) return;
  if (navigate) cancelRestoration();
  if (navigate && switching && (previousView === 'explore' || previousView === 'collection'))
    workspacePositions.set(previousView, captureWorkspace());
  if (switching && previousView === 'places') places.cancel();
  if (switching && previousView === 'visualize')
    chartPosition = { title: $('visualize').querySelector('h2'), scrollY: window.scrollY };
  const position = navigate ? workspacePositions.get(view) : null;
  searchHandoff.setView(view);
  for (const [id, name] of [
    ['exploreNav', 'explore'],
    ['collectionNav', 'collection'],
    ['visualizeNav', 'visualize'],
    ['placesNav', 'places'],
  ])
    $(id).setAttribute('aria-pressed', String(view === name));
  document.body.classList.toggle('is-collection', view === 'collection' || view === 'places');
  $('places').hidden = view !== 'places';
  $('visualize').hidden = view !== 'visualize';
  state.view = view;
  renderExploreSurface();
  renderDraftStatus();
  if (view !== 'collection') collectionTools.cancel();
  if (view !== 'visualize') visualizer.cancel();
  if (view === 'places') {
    renderStatus();
    if (navigate) window.scrollTo({ top: 0, behavior: 'instant' });
    if (placeOptions) places.show(placeOptions);
    else places.restore();
    if (syncURL) updateURL({ push: navigate });
    return;
  }
  if (view === 'visualize') {
    renderStatus();
    if (!resumeChart) {
      chartReturn = null;
      visualizer.show({ ...(state.resultQuery || state.query) });
      const sameChart = chartPosition?.title === $('visualize').querySelector('h2');
      if (navigate)
        window.scrollTo({ top: sameChart ? chartPosition.scrollY : 0, behavior: 'instant' });
    }
    if (syncURL) updateURL({ push: navigate });
    return;
  }
  $('research').classList.toggle('collection-view', view === 'collection');
  $('research').classList.remove('mobile-detail-open');
  $('refinements').hidden = view === 'collection' || !state.query.q;
  $('sortSelect').parentElement.hidden = view === 'collection';
  $('activeQuery').hidden = view === 'collection' || !$('activeQuery').childElementCount;
  const heading = view === 'collection' ? 'h1' : 'h2';
  const title = view === 'collection' ? 'Your collection' : 'Publications';
  if ($('resultsTitle').tagName.toLowerCase() !== heading)
    $('resultsTitle').replaceWith(
      el(heading, { id: 'resultsTitle', class: 'results-title', tabindex: '-1' }, title),
    );
  else $('resultsTitle').textContent = title;
  $('collectionTools').hidden = view !== 'collection';
  $('searchExplanation').hidden = view === 'collection';
  const selected = navigate ? position?.selected : state.selected;
  const works = visibleWorks();
  const work = works.find((work) => work.id === selected) || works[0];
  const reading = position?.inspector;
  // References and inspected candidates may have no corresponding row.
  const restore = reading && (work?.id === selected || position.outsideList);
  state.selected = restore ? selected : work?.id || null;
  if (restore) {
    if (position.mobileDetail && matchMedia(BREAKPOINTS.mobile).matches)
      $('research').classList.add('mobile-detail-open');
    inspector.restore(reading, { restorePage: false });
  } else {
    renderInspector(work);
    $('inspector').scrollTop = 0;
  }
  renderList();
  renderStatus();
  if (navigate) window.scrollTo({ top: position?.scrollY || 0, behavior: 'instant' });
  if (syncURL) updateURL({ push: navigate });
  if (view === 'explore' && state.query.q && !state.resultQuery && !state.loading && load)
    runSearch();
}
function renderExploreSurface() {
  const explore = state.view === 'explore';
  const idle = explore && !state.query.q && !state.directRecord;
  $('landing').hidden = !idle;
  $('research').hidden = state.view !== 'collection' && (!explore || idle);
  document.querySelector('.skip-link').href = idle
    ? '#searchInput'
    : '#' + VIEW_CONFIG[state.view].skipTarget;
  if (idle) document.querySelector('.skip-link').textContent = 'Skip to search';
  else document.querySelector('.skip-link').textContent = VIEW_CONFIG[state.view].skipLabel;
  $('searchRefinementsHelp').hidden = !idle;
  if (idle) $('searchRefinementsHelp').open = false;
  document.querySelector('.search-help-link').href = idle
    ? '#searchRefinementsHelp'
    : '#searchExplanation';
  $('searchSiteOnly').hidden = !(
    explore && state.query.q === $('hierakonpolisTile').textContent.trim()
  );
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
  if (matchMedia(BREAKPOINTS.mobile).matches) {
    $('research').classList.add('mobile-detail-open');
    $('inspector').focus();
    $('research').scrollIntoView({ block: 'start' });
  }
  updateURL({ push: true });
}
function renderList() {
  const list = $('resultList');
  list.setAttribute('aria-busy', String(state.view === 'explore' && state.loading));
  if (state.view === 'explore' && !state.query.q && state.directRecord) {
    const work = inspector.getCurrentWork();
    const entry =
      work &&
      createResultRow(work, {
        view: 'explore',
        selected: true,
        saved: state.collection.has(work.id),
        onOpen: selectWork,
        onSave: toggleSave,
      });
    list.replaceChildren(...(entry ? [entry] : []));
    return;
  }
  if (state.view === 'explore' && state.loading && (!state.items.length || chartSearch)) {
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
    ...visibleWorks().map((work) =>
      createResultRow(work, {
        view: state.view,
        selected: state.selected === work.id,
        saved: state.collection.has(work.id),
        selectedForExport: state.exportSelection.has(work.id),
        onOpen: selectWork,
        onSave: toggleSave,
        onSelectionChange: toggleSelection,
      }),
    ),
  );
}
function toggleSelection(id, checked) {
  if (checked) {
    state.exportSelection.add(id);
    state.exportScope = 'selected';
  } else state.exportSelection.delete(id);
  collectionTools.sync();
  saveSession();
}
function renderStatus() {
  $('research').classList.toggle(
    'chart-searching',
    state.view === 'explore' && state.loading && chartSearch,
  );
  $('collectionUndo').hidden = !state.lastRemoved;
  if (state.lastRemoved)
    $('removedTitle').textContent = `Removed “${state.lastRemoved.work.title}”.`;
  $('collectionCount').textContent = state.collection.size;
  $('visualizeResults').hidden =
    state.view !== 'explore' || !state.resultQuery || state.doiLookup || state.loading;
  $('backToChart').hidden = state.view !== 'explore' || !chartReturn;
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
  if (state.view !== 'explore') return;
  if (!state.query.q && state.directRecord) {
    $('resultCount').textContent = 'Direct DOI link';
    $('scopeNote').textContent = 'Publication metadata from Crossref.';
    $('effectiveQuery').textContent = 'A direct DOI link retrieves one publication record.';
    $('sortSelect').parentElement.hidden = true;
    $('requestNotice').hidden = true;
    $('resultsFooter').replaceChildren();
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
    : `${previous ? 'Previous results: ' : ''}${state.items.length.toLocaleString()} results loaded`;
  const resultQuery = state.resultQuery || state.query;
  const ranking =
    resultQuery.sort === 'relevance'
      ? 'Ranked by Crossref'
      : `Sorted by publication date, ${resultQuery.sort === 'oldest' ? 'oldest' : 'newest'} first`;
  $('scopeNote').textContent = state.doiLookup
    ? 'DOI lookup opens one exact Crossref record; topic and publication filters do not apply.'
    : chartSearch && state.loading
      ? `Applying chart filters in Crossref for “${state.query.q}”.`
      : `${previous ? `Showing the last successful search for “${resultQuery.q}”. ` : `Results for “${resultQuery.q}”. `}${ranking}${state.retrievedAt ? ` · ${state.cached ? 'cached' : 'retrieved'} ${new Date(state.retrievedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}. Relevance and coverage vary.${resultQuery.sort !== 'relevance' ? ` Date-sorted browsing covers the first ${DATE_BROWSE_LIMIT.toLocaleString()} candidates; narrow your search for more focused results.` : ''}`;
  renderSearchNotice($('requestNotice'), {
    error: state.error,
    retryable: state.errorRetryable,
    onAction: () =>
      state.errorRetryable ? runSearch(state.failedAppend) : $('searchInput').focus(),
  });
  renderSearchFooter($('resultsFooter'), {
    nextCursor: state.nextCursor,
    browseLimited: state.browseLimited,
    previous,
    loading: state.loading,
    onLoadMore: () => runSearch(true),
  });
  $('sortSelect').disabled = state.loading;
}
async function runSearch(append = false) {
  if (!state.query.q) return;
  state.directRecord = null;
  if (state.view !== 'explore') setView('explore', { syncURL: false, load: false });
  state.controller?.abort();
  const controller = new AbortController();
  state.controller = controller;
  const requestId = ++state.requestId;
  renderExploreSurface();
  $('refinements').hidden = false;
  $('searchExplanation').hidden = false;
  $('sortSelect').parentElement.hidden = false;
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
    if (!append && state.view === 'explore') {
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
      chartSearch = false;
      renderAppliedQuery();
      if (state.view === 'explore') {
        renderList();
        renderStatus();
      }
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
function setMoreTypes(open) {
  $('morePublicationTypes').hidden = !open;
  $('showPublicationTypes').setAttribute('aria-expanded', String(open));
  $('showPublicationTypes').textContent = open ? 'Show fewer types' : 'Show more types';
}
$('showPublicationTypes').addEventListener('click', () =>
  setMoreTypes($('morePublicationTypes').hidden),
);
$('sortSelect').addEventListener('change', (e) => {
  cancelRestoration();
  state.query.sort = e.target.value;
  state.draft = readDraft();
  runSearch();
});
function validateYears() {
  for (const id of ['yearFrom', 'yearTo']) {
    if (!$(id).checkValidity()) {
      $('refinements').open = true;
      $('yearRefinement').open = true;
      $(id).reportValidity();
      return false;
    }
  }
  const from = $('yearFrom').value;
  const to = $('yearTo').value;
  const invalid = from && to && Number(from) > Number(to);
  $('filterError').hidden = !invalid;
  if (invalid) {
    $('refinements').open = true;
    $('yearRefinement').open = true;
    $('filterError').textContent = 'The start year must come before the end year.';
    $('filterError').setAttribute('tabindex', '-1');
    $('filterError').focus();
    return false;
  }
  return true;
}
function submitSearch(e) {
  e.preventDefault();
  captureDraft();
  $('searchError').hidden = true;
  if (!state.draft.q) {
    const input = $(e.currentTarget.id === 'navSearchForm' ? 'navSearchInput' : 'searchInput');
    input.setCustomValidity('Enter a title, topic, author, or DOI.');
    input.reportValidity();
    return;
  }
  if (state.draft.field === 'doi' && !normalizeDOI(state.draft.q)) {
    $('searchError').textContent =
      'Enter a complete DOI, such as 10.1234/example, or choose All metadata.';
    $('searchError').hidden = false;
    searchHandoff.searchInput().setCustomValidity($('searchError').textContent);
    searchHandoff.searchInput().reportValidity();
    return;
  }
  if (!validateYears()) return;
  cancelRestoration();
  const fromWorkspace = state.view !== 'explore' || $('research').hidden;
  chartReturn = null;
  chartSearch = false;
  state.query = { ...state.draft };
  runSearch();
  if (fromWorkspace) focusHeading($('resultsTitle'));
}
for (const id of ['searchForm', 'navSearchForm']) $(id).addEventListener('submit', submitSearch);
function startLandingSearch(query) {
  cancelRestoration();
  chartReturn = null;
  chartSearch = false;
  state.query = readQuery(new URLSearchParams({ q: query, context: '0' }).toString());
  state.draft = { ...state.query };
  syncControls();
  runSearch();
  focusHeading($('resultsTitle'));
}
$('landing').addEventListener('click', (event) => {
  const tile = event.target.closest('.research-tile');
  if (
    !tile ||
    event.defaultPrevented ||
    event.button ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    event.shiftKey
  )
    return;
  event.preventDefault();
  history.replaceState({ ...history.state, landingTile: tile.id, landingDraft: state.draft }, '');
  startLandingSearch(new URL(tile.href).searchParams.get('q'));
});
$('landingPlaces').addEventListener('click', () =>
  setView('places', { placeOptions: { focus: true } }),
);
$('searchSiteOnly').addEventListener('click', () => startLandingSearch('Hierakonpolis'));
$('filterForm').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!validateYears()) return;
  applyRefinement({ from: $('yearFrom').value, to: $('yearTo').value });
});
for (const id of ['searchInput', 'navSearchInput']) {
  $(id).addEventListener('input', () => {
    const other = id === 'searchInput' ? 'navSearchInput' : 'searchInput';
    $(other).value = $(id).value;
    $('searchInput').setCustomValidity('');
    $('navSearchInput').setCustomValidity('');
    $('searchError').hidden = true;
    captureDraft();
  });
}
$('searchField').addEventListener('change', () => {
  $('searchInput').setCustomValidity('');
  $('navSearchInput').setCustomValidity('');
  $('searchError').hidden = true;
  captureDraft();
});
$('filterForm').addEventListener('input', captureDraft);
$('filterForm').addEventListener('change', (e) => {
  captureDraft();
  const target = e.target;
  const filter =
    target.name === 'publicationType'
      ? 'type'
      : {
          periodSelect: 'period',
          addEgyptContext: 'context',
          hasAbstract: 'abstract',
          hasOrcid: 'orcid',
          hasReferences: 'references',
        }[target.id];
  if (filter) applyRefinement({ [filter]: state.draft[filter] });
});
$('discardDraft').addEventListener('click', () => {
  state.draft = { ...(state.resultQuery || state.query) };
  state.query = { ...state.draft };
  state.error = '';
  syncControls();
  renderStatus();
  updateURL();
  searchHandoff.searchInput().focus();
});
$('clearFilters').addEventListener('click', () => {
  applyRefinement({
    period: '',
    context: false,
    container: '',
    type: '',
    from: '',
    to: '',
    abstract: false,
    orcid: false,
    references: false,
  });
  focusRefinementAction();
});
document.querySelector('.search-help-link').addEventListener('click', (event) => {
  event.preventDefault();
  if (state.view !== 'explore') setView('explore');
  const help = $('research').hidden ? $('searchRefinementsHelp') : $('searchExplanation');
  help.open = true;
  const summary = help.querySelector('summary');
  summary.focus();
  summary.scrollIntoView({ block: 'nearest' });
});
$('exploreNav').addEventListener('click', () => setView('explore'));
$('placesNav').addEventListener('click', () => setView('places'));
$('visualizeNav').addEventListener('click', () => setView('visualize'));
$('collectionNav').disabled = false;
$('collectionNav').addEventListener('click', () => setView('collection'));
$('dismissUndo').addEventListener('click', () => {
  state.lastRemoved = null;
  renderStatus();
  $('resultsTitle').setAttribute('tabindex', '-1');
  $('resultsTitle').focus();
});
async function restoreRemoved() {
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
    if (state.view === 'places') places.refresh();
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
}
$('undoRemoval').addEventListener('click', restoreRemoved);
collectionStore.subscribe(({ records, warning }) => {
  state.collection = records;
  state.storageWarning = warning;
  reconcileCollection();
  renderList();
  renderStatus();
  inspector.refresh();
  if (state.view === 'places') places.refresh();
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
  const landingTile = history.state?.landingTile;
  try {
    state.query = readQuery(location.search);
    state.directRecord =
      !state.query.q && !params.get('view') ? normalizeDOI(record) || null : null;
    if (!state.query.q) {
      state.controller?.abort();
      state.requestId++;
      state.loading = false;
      state.resultQuery = null;
      state.items = [];
      state.nextCursor = null;
      state.error = '';
      state.doiLookup = false;
      workspacePositions.delete('explore');
      chartReturn = null;
      chartSearch = false;
    }
    const idleLanding = !state.query.q && !state.directRecord && !params.has('view');
    const draft = resume?.draft ?? (idleLanding ? history.state?.landingDraft : null);
    state.draft = draft ? readQuery(queryString(draft)) : { ...state.query };
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
    if (params.get('view') === 'atlas') params.set('view', 'places');
    const view = ['collection', 'visualize', 'places'].includes(params.get('view'))
      ? params.get('view')
      : 'explore';
    placeReturnContext = resume?.placesOrigin || (view === 'places' ? placeReturnContext : null);
    setView(view, {
      navigate: false,
      syncURL: false,
      load: false,
      placeOptions: {
        ...readPlaceState(params),
        session: resume?.places,
        origin: placeOrigin(placeReturnContext),
      },
    });
    if (
      view === 'explore' &&
      state.query.q &&
      (!state.resultQuery || queryString(state.resultQuery) !== queryString(state.query))
    )
      await runSearch();
    if (navigation !== navigationGeneration) return;
    if (view === 'visualize' || view === 'places') return;
    if (view === 'explore' && $('research').hidden) {
      if (landingTile) $(landingTile)?.focus();
      return;
    }
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
    if (detail && matchMedia(BREAKPOINTS.mobile).matches)
      $('research').classList.add('mobile-detail-open');
    else $('research').classList.remove('mobile-detail-open');
    renderStatus();
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
$('places').addEventListener('focusin', savePosition);
$('places').addEventListener('scroll', savePosition, { passive: true, capture: true });
window.addEventListener('scroll', savePosition, { passive: true });
const filterLayout = matchMedia(BREAKPOINTS.desktop);
$('refinements').open = filterLayout.matches;
filterLayout.addEventListener('change', (event) => {
  $('refinements').open = event.matches;
});
syncControls();
await restoreLocation(resumedSession);
