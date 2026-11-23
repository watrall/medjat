import { el, icon } from './dom.js';
import { MAX_IMPORT_BYTES, parseCollection } from './collection.js';
import { researchData, validateResearchBackup } from './research-store.js';
import { EXPORT_FORMATS, exportCollection, downloadFile, scopedRecords } from './export.js';

const COLLECTION_SORTS = [
  ['saved-new', 'Recently saved'],
  ['saved-old', 'First saved'],
  ['title', 'Title A to Z'],
  ['year-new', 'Year, newest first'],
  ['year-old', 'Year, oldest first'],
  ['cited', 'Most cited'],
];

export function createCollectionTools(
  root,
  { getState, onQuery, onSelect, onPreferences, onImport, onMap, onReview, onDiscover },
) {
  const noun = (count) => (count === 1 ? 'publication' : 'publications');
  let controller = null,
    job = null;
  const search = el('input', {
    id: 'collectionSearch',
    type: 'search',
    placeholder: 'Title, author, keyword, note, or tag',
    oninput: (event) => {
      onQuery(event.target.value);
      sync();
    },
  });
  const sort = el('select', {
    id: 'collectionSort',
    onchange: () => onPreferences({ sort: sort.value }),
  });
  for (const [value, label] of COLLECTION_SORTS) sort.append(el('option', { value }, label));
  const tagFilter = el('select', {
    id: 'collectionTag',
    onchange: () => onPreferences({ tag: tagFilter.value }),
  });
  const tagField = el('label', { for: 'collectionTag', hidden: true }, 'Tag', tagFilter);
  const scope = el('select', {
    id: 'exportScope',
    onchange: () => {
      onPreferences({ scope: scope.value });
      sync();
    },
  });
  const format = el('select', {
    id: 'exportFormat',
    onchange: () => {
      onPreferences({ format: format.value });
      sync();
    },
  });
  for (const [value, metadata] of Object.entries(EXPORT_FORMATS))
    format.append(el('option', { value }, metadata.shortLabel));
  const scopeHelp = el('p', { id: 'exportScopeHelp', class: 'export-scope-help' });
  const formatHelp = el('p', { id: 'exportFormatHelp', class: 'export-format-help' });
  scope.setAttribute('aria-describedby', 'exportScopeHelp');
  format.setAttribute('aria-describedby', 'exportFormatHelp');
  const status = el('p', { id: 'exportStatus', role: 'status' });
  const selectionSummary = el('span', { id: 'selectionSummary', role: 'status' });
  const matching = el(
    'button',
    { class: 'text-button', onclick: () => onSelect(getState().visible.map((work) => work.id)) },
    'Select matching',
  );
  const clear = el(
    'button',
    { class: 'text-button', onclick: () => onSelect([]) },
    'Clear selection',
  );
  const cancel = el(
    'button',
    { class: 'text-button', hidden: true, onclick: () => controller?.abort() },
    'Cancel export',
  );
  const button = el('button', { class: 'button button-primary', onclick: runExport });
  const importStatus = el('p', { class: 'import-status', role: 'status' });
  const importPreview = el('div', { class: 'collection-import-preview', hidden: true });
  const importButton = el(
    'button',
    { class: 'text-button', onclick: () => file.click() },
    icon('library-big'),
    'Import collection',
  );
  const file = el('input', {
    type: 'file',
    id: 'importCollection',
    hidden: true,
    accept: '.json,application/json',
    onchange: async () => {
      const selected = file.files?.[0];
      if (!selected || importButton.disabled) return;
      importPreview.hidden = true;
      importPreview.replaceChildren();
      importStatus.textContent = '';
      importButton.disabled = true;
      try {
        if (selected.size > MAX_IMPORT_BYTES)
          throw new Error(
            `Choose a collection file smaller than ${MAX_IMPORT_BYTES / 1024 / 1024} MB.`,
          );
        const imported = parseCollection(await selected.text());
        const current = getState().records;
        const decisions = researchData();
        const reviewed = new Map();
        const reviewedResearch = new Map();
        for (const id of imported.records.keys())
          if (current.has(id)) reviewed.set(id, current.get(id));
        for (const key of validateResearchBackup(imported.research).entries.keys())
          if (Object.hasOwn(decisions, key)) reviewedResearch.set(key, decisions[key]);
        if (reviewed.size || reviewedResearch.size) {
          previewImport(imported, reviewed, reviewedResearch);
        } else await finishImport(imported);
      } catch (error) {
        importStatus.textContent = error.message;
      } finally {
        file.value = '';
        importButton.disabled = false;
      }
    },
  });
  async function finishImport(imported, reviewed, reviewedResearch) {
    // Close the preview before writing so a double click cannot repeat the import.
    importPreview.hidden = true;
    importPreview.replaceChildren();
    importButton.disabled = true;
    try {
      importStatus.textContent = await onImport(imported, reviewed, reviewedResearch);
    } catch (error) {
      importStatus.textContent = error.message;
    } finally {
      importButton.disabled = false;
      importButton.focus();
    }
  }
  function previewImport(imported, reviewed, reviewedResearch) {
    const matches = reviewed.size + reviewedResearch.size;
    const summary = `This backup matches ${reviewed.size} saved ${noun(reviewed.size)} and ${reviewedResearch.size} research ${reviewedResearch.size === 1 ? 'decision' : 'decisions'}.`;
    const keep = el(
      'button',
      { class: 'button button-primary', onclick: () => finishImport(imported) },
      'Keep existing and import new',
    );
    const examples = [
      ...[...reviewed].map(([id, entry]) => `${entry.work.title} · ${id}`),
      ...reviewedResearch.keys(),
    ];
    importPreview.replaceChildren(
      el('p', {}, summary),
      el(
        'details',
        {},
        el('summary', {}, `View matching entries (${matches})`),
        el(
          'ul',
          {},
          examples.slice(0, 10).map((label) => el('li', {}, label)),
        ),
        matches > 10 && el('p', {}, `Plus ${matches - 10} more matching entries.`),
      ),
      el(
        'div',
        { class: 'selection-controls' },
        keep,
        el(
          'button',
          { class: 'button', onclick: () => finishImport(imported, reviewed, reviewedResearch) },
          'Replace matching entries and import new',
        ),
        el(
          'button',
          {
            class: 'text-button',
            onclick: () => {
              importPreview.hidden = true;
              importPreview.replaceChildren();
              importButton.focus();
            },
          },
          'Cancel import',
        ),
      ),
    );
    importPreview.hidden = false;
    keep.focus();
  }
  const exportSummary = el('summary', {}, 'Export bibliography');
  const exportOptions = el(
    'details',
    { class: 'collection-export-options' },
    exportSummary,
    el(
      'div',
      { class: 'export-controls' },
      el('label', { for: 'exportScope' }, 'Export scope', scope),
      el('label', { for: 'exportFormat' }, 'Export format', format),
      button,
      cancel,
    ),
    scopeHelp,
    formatHelp,
    status,
    el(
      'p',
      { class: 'collection-backup-note' },
      'Saved in this browser. Export a JSON backup to keep a portable copy.',
    ),
  );
  const map = el(
    'button',
    { id: 'mapCollection', class: 'text-button', onclick: onMap },
    'Map saved publications',
  );
  const review = el(
    'button',
    { class: 'button', onclick: onReview },
    'Check saved publications for metadata changes',
  );
  const discover = el('button', { class: 'button', onclick: onDiscover });
  const updateStatus = el('p', { class: 'scope-note', role: 'status' });
  const changeReview = el('div', { id: 'changeReview', class: 'research-tools', hidden: true });
  const research = el('div', { id: 'researchTools', class: 'research-tools', hidden: true });
  review.addEventListener('click', () => {
    changeReview.hidden = false;
  });
  discover.addEventListener('click', () => {
    research.hidden = false;
  });
  root.replaceChildren(
    el(
      'div',
      { class: 'collection-toolbar' },
      el(
        'label',
        { for: 'collectionSearch', class: 'collection-search-label' },
        'Search saved publications, notes, and tags',
        search,
      ),
      el(
        'div',
        { class: 'collection-filters' },
        el('label', { for: 'collectionSort' }, 'Sort', sort),
        tagField,
      ),
      el('div', { class: 'selection-controls collection-research-actions' }, review, discover),
      updateStatus,
      el(
        'div',
        { class: 'collection-actions' },
        selectionSummary,
        map,
        el(
          'details',
          { class: 'collection-actions-menu' },
          el('summary', {}, 'Collection tools'),
          el('div', { class: 'selection-controls' }, matching, clear, importButton, file),
          importStatus,
          importPreview,
          exportOptions,
        ),
      ),
      changeReview,
      research,
    ),
  );
  function counts() {
    const state = getState();
    return {
      all: state.records.size,
      matching: state.visible.length,
      selected: [...state.selection].filter((id) => state.records.has(id)).length,
    };
  }
  function sync() {
    const state = getState(),
      totals = counts();
    if (search.value !== state.query) search.value = state.query;
    const options = {
      all: `All saved (${totals.all})`,
      matching: `Matching (${totals.matching})`,
      selected: `Selected (${totals.selected})`,
    };
    scope.replaceChildren(
      ...Object.entries(options).map(([value, label]) => el('option', { value }, label)),
    );
    scope.value = state.scope;
    updateStatus.textContent = state.updateStatus;
    updateStatus.hidden = !state.updateStatus;
    sort.value = state.sort;
    const { tags } = state;
    tagField.hidden = !tags.length;
    tagFilter.replaceChildren(
      el('option', { value: '' }, 'All tags'),
      ...tags.map(({ tag, count }) => el('option', { value: tag }, `${tag} (${count})`)),
    );
    tagFilter.value = tags.some(({ tag }) => tag === state.tag) ? state.tag : '';
    format.value = state.format;
    scope.disabled = format.disabled = Boolean(controller);
    const count = totals[state.scope];
    exportSummary.textContent = `Export bibliography (${count} ${state.scope === 'all' ? 'saved' : state.scope})`;
    button.disabled = Boolean(controller) || !count;
    button.replaceChildren(
      icon('download'),
      controller ? 'Exporting…' : `Export ${count} ${count === 1 ? 'publication' : 'publications'}`,
    );
    scopeHelp.textContent =
      job ||
      (state.scope === 'all'
        ? `Exports all ${count} saved ${noun(count)}${state.query ? `, including ${totals.all - totals.matching} outside this search` : ''}.`
        : state.scope === 'matching'
          ? `Exports ${count} ${noun(count)} matching your collection search.`
          : `Exports ${count} selected ${noun(count)}, including selections outside this search.`);
    formatHelp.textContent =
      state.format === 'json'
        ? 'JSON preserves source metadata and can be imported here.'
        : state.format === 'csv'
          ? 'CSV contains bibliographic metadata for a spreadsheet.'
          : `${EXPORT_FORMATS[state.format].shortLabel} is formatted by Crossref for reference managers. Check imported citations against the publications.`;
    const hidden = [...state.selection].filter(
      (id) => state.records.has(id) && !state.visible.some((work) => work.id === id),
    ).length;
    selectionSummary.textContent = `${totals.selected} selected${hidden ? ` (${hidden} outside this search)` : ''}`;
    map.disabled = review.disabled = !totals.all;
    const seedCount = totals.selected || totals.all;
    discover.disabled = !seedCount;
    discover.textContent = `Discover references from ${seedCount} ${totals.selected ? 'selected' : 'saved'} ${noun(seedCount)}`;
    matching.disabled = !totals.matching;
    matching.hidden = !totals.matching;
    clear.disabled = !totals.selected;
    clear.hidden = !totals.selected;
  }
  async function runExport() {
    if (controller) return;
    const state = getState();
    const snapshot = scopedRecords(
      state.records,
      state.scope,
      state.visible.map((work) => work.id),
      state.selection,
    );
    if (!snapshot.size) return;
    const outputFormat = state.format,
      outputScope = state.scope;
    const active = new AbortController();
    controller = active;
    job = `Exporting a snapshot of ${snapshot.size} ${outputScope === 'all' ? 'saved' : outputScope} ${noun(snapshot.size)}.`;
    cancel.hidden = false;
    status.textContent = 'Preparing your bibliography…';
    sync();
    try {
      const text = await exportCollection(snapshot, outputFormat, {
        signal: active.signal,
        research: researchData(),
        onProgress: (done, total) => {
          status.textContent = `Formatted ${done} of ${total} publications…`;
        },
      });
      active.signal.throwIfAborted();
      downloadFile(text, outputFormat, { scope: outputScope, count: snapshot.size });
      status.textContent = `Exported ${snapshot.size} ${outputScope === 'all' ? 'saved' : outputScope} ${noun(snapshot.size)}. Your collection and selection are unchanged.`;
    } catch (error) {
      status.textContent = active.signal.aborted
        ? 'Export cancelled. Your collection and selection are unchanged.'
        : `Export failed. ${error.status ? 'Crossref format conversion is unavailable for this export.' : error.message} Try CSV or JSON backup to keep your records. Your collection and selection are unchanged.`;
    } finally {
      controller = null;
      job = null;
      cancel.hidden = true;
      sync();
    }
  }
  return { sync, changeReview, research, cancel: () => controller?.abort() };
}
