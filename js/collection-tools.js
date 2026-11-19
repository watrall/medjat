import { el, icon } from './dom.js';
import { MAX_IMPORT_BYTES, parseCollection } from './collection.js';
import { EXPORT_FORMATS, exportCollection, downloadFile, scopedRecords } from './export.js';

export function createCollectionTools(
  root,
  { getState, onQuery, onSelect, onPreferences, onImport },
) {
  const noun = (count) => (count === 1 ? 'publication' : 'publications');
  let controller = null,
    job = null;
  const search = el('input', {
    id: 'collectionSearch',
    type: 'search',
    placeholder: 'Title, author, or keyword',
    oninput: (event) => {
      onQuery(event.target.value);
      sync();
    },
  });
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
  const file = el('input', {
    type: 'file',
    id: 'importCollection',
    hidden: true,
    accept: '.json,application/json',
    onchange: async () => {
      const selected = file.files?.[0];
      if (!selected) return;
      exportOptions.open = true;
      try {
        if (selected.size > MAX_IMPORT_BYTES)
          throw new Error(
            `Choose a collection file smaller than ${MAX_IMPORT_BYTES / 1024 / 1024} MB.`,
          );
        status.textContent = await onImport(parseCollection(await selected.text()));
        sync();
      } catch (error) {
        status.textContent = error.message;
      } finally {
        file.value = '';
      }
    },
  });
  const exportSummary = el('summary', {}, 'Export bibliography');
  const exportLayout = matchMedia('(min-width:1000px)');
  const exportOptions = el(
    'details',
    { class: 'collection-export-options', open: exportLayout.matches },
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
  exportLayout.addEventListener('change', (event) => {
    if (!controller) exportOptions.open = event.matches;
  });
  root.replaceChildren(
    el(
      'div',
      { class: 'collection-toolbar' },
      el(
        'label',
        { for: 'collectionSearch', class: 'collection-search-label' },
        'Search saved publications',
        search,
      ),
      el(
        'div',
        { class: 'selection-controls' },
        selectionSummary,
        matching,
        clear,
        el(
          'button',
          { class: 'text-button', onclick: () => file.click() },
          icon('library-big'),
          'Import collection',
        ),
        file,
      ),
      exportOptions,
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
  return { sync, cancel: () => controller?.abort() };
}
