import { placeEvidence } from './place-data.js';
import { researchData, reviewDecision } from './research-store.js';
import { exportCollection, downloadFile } from './export.js';
import { el, icon, notify } from './dom.js';
const noun = (count) => (count === 1 ? 'publication' : 'publications');

export function collectionPlaces(records, sites, decisions = {}) {
  const associations = [],
    rejected = [],
    unassigned = [],
    notSpecific = [];
  const counts = new Map();
  for (const { work } of records.values()) {
    if (decisions[`place-scope:${work.id}`]?.decision === 'not-place-specific') {
      notSpecific.push(work);
      continue;
    }
    let found = false;
    for (const place of sites) {
      const key = `place:${work.id}:${place.id}`,
        review = decisions[key],
        evidence = placeEvidence(work, place);
      if (!evidence && !['confirmed', 'rejected'].includes(review?.decision)) continue;
      const association = {
        work,
        place,
        evidence,
        key,
        status: review?.decision || 'suggested',
        method: review?.method || 'metadata',
      };
      if (association.status === 'rejected') {
        rejected.push(association);
        continue;
      }
      found = true;
      associations.push(association);
      counts.set(place.id, (counts.get(place.id) || 0) + 1);
    }
    if (!found) unassigned.push(work);
  }
  return {
    associations,
    rejected,
    unassigned,
    notSpecific,
    counts,
    mapped: new Set(associations.map((link) => link.work.id)).size,
  };
}

export function createPlaceCollection(root, { sites, getSaved, onInspect, onChoose, onRefresh }) {
  let selected = '',
    status = 'all',
    snapshot,
    exportJob = null,
    exporting = false,
    exportMessage = '';
  const decide = (key, value) => {
    if (!reviewDecision(key, value))
      notify('Place review is kept for this visit only. Export a JSON backup to retain it.');
  };
  function refresh() {
    render(selected);
    onRefresh();
  }
  function review(link, decision) {
    decide(link.key, {
      decision,
      doi: link.work.id,
      place: link.place.id,
      source: link.place.source,
      evidence: link.evidence?.text || 'Assigned by researcher',
      method: link.method,
    });
    refresh();
    const row = [...root.querySelectorAll('[data-place-work]')].find(
      (row) => row.dataset.placeWork === link.work.id,
    );
    (
      row?.querySelector('.place-publication-title') ||
      root.querySelector('#placeAssociationStatus')
    ).focus({ preventScroll: true });
  }
  const filtered = () =>
    snapshot.associations.filter(
      (link) =>
        (!selected || link.place.id === selected) && (status === 'all' || link.status === status),
    );
  function stats(id) {
    return (
      snapshot?.associations.filter(
        (link) => link.place.id === id && (status === 'all' || link.status === status),
      ).length || 0
    );
  }
  function syncExport() {
    const state = root.querySelector('[data-export-status]');
    if (state) state.textContent = exportMessage;
    const button = root.querySelector('[data-place-export]');
    if (button) button.disabled = exporting || !filtered().length;
    const cancel = root.querySelector('[data-cancel-export]');
    if (cancel) cancel.hidden = !exporting;
  }
  async function runExport(format) {
    if (exporting) return;
    const ids = new Set(filtered().map((link) => link.work.id)),
      records = new Map([...getSaved()].filter(([id]) => ids.has(id)));
    if (!records.size) return;
    const label = sites.find((site) => site.id === selected)?.name || 'all associated places';
    const controller = new AbortController();
    exportJob = controller;
    exporting = true;
    exportMessage = `Preparing ${records.size} saved ${noun(records.size)} for ${label}…`;
    syncExport();
    try {
      const text = await exportCollection(records, format, {
        signal: controller.signal,
        onProgress: (done, total) => {
          exportMessage = `Preparing ${done} of ${total} publications for ${label}…`;
          syncExport();
        },
      });
      controller.signal.throwIfAborted();
      downloadFile(text, format, {
        scope: `place-${selected || 'associated'}`,
        count: records.size,
      });
      exportMessage = `Exported ${records.size} ${noun(records.size)} for ${label}.`;
    } catch (error) {
      exportMessage = controller.signal.aborted
        ? 'Place bibliography export cancelled.'
        : error.message;
    } finally {
      exporting = false;
      syncExport();
    }
  }
  function render(placeID) {
    const samePlace = selected === placeID;
    const draftWork = root.querySelector('#assignPlaceWork')?.value;
    const draftTarget = samePlace ? root.querySelector('#assignPlaceTarget')?.value : placeID;
    const draftFormat = root.querySelector('#placeExportFormat')?.value;
    const assignmentOpen = root.querySelector('.place-assignment')?.open;
    selected = placeID;
    snapshot = collectionPlaces(getSaved(), sites, researchData());
    const current = sites.find((site) => site.id === selected),
      links = filtered(),
      works = [...new Map(links.map((link) => [link.work.id, link.work])).values()];
    const filter = el(
      'select',
      {
        id: 'placeAssociationStatus',
        onchange: (event) => {
          status = event.target.value;
          refresh();
          root.querySelector('#placeAssociationStatus').focus();
        },
      },
      [
        ['all', 'Suggested and confirmed'],
        ['confirmed', 'Researcher-confirmed'],
        ['suggested', 'Suggested from metadata'],
      ].map(([value, label]) => el('option', { value, selected: value === status }, label)),
    );
    root.replaceChildren(
      el('p', { class: 'eyebrow' }, 'YOUR CROSSREF COLLECTION'),
      el(
        'h2',
        { tabindex: '-1' },
        current ? `${current.name} in your collection` : 'Places in your collection',
      ),
      el(
        'p',
        { class: 'place-collection-coverage', role: 'status' },
        `${getSaved().size} saved ${noun(getSaved().size)} · ${snapshot.mapped} with place associations · ${snapshot.unassigned.length} with no place assigned · ${snapshot.notSpecific.length} marked not place-specific`,
      ),
      el(
        'p',
        { class: 'scope-note' },
        'Associations describe your saved bibliography, not the distribution of all scholarship. Publications may concern several places. Suggestions require your judgment.',
      ),
      el(
        'label',
        { class: 'place-status-control', for: 'placeAssociationStatus' },
        'Association evidence',
        filter,
      ),
    );
    const format = el(
      'select',
      { id: 'placeExportFormat' },
      [
        ['ris', 'RIS'],
        ['bibtex', 'BibTeX'],
        ['csv', 'CSV metadata'],
        ['json', 'JSON backup'],
      ].map(([value, label]) => el('option', { value }, label)),
    );
    root.append(
      el(
        'div',
        { class: 'place-bibliography-export' },
        el('p', {}, `${works.length} saved publications under these controls`),
        el(
          'div',
          { class: 'place-export-controls' },
          el('label', { for: 'placeExportFormat' }, 'Bibliography format', format),
          el(
            'button',
            {
              class: 'button',
              'data-place-export': true,
              disabled: !works.length || exporting,
              onclick: () => runExport(format.value),
            },
            icon('download'),
            `Export ${works.length} ${noun(works.length)}`,
          ),
          el(
            'button',
            {
              class: 'text-button',
              'data-cancel-export': true,
              hidden: !exporting,
              onclick: () => exportJob?.abort(),
            },
            'Cancel export',
          ),
        ),
        el(
          'p',
          { class: 'scope-note' },
          'Exports a snapshot of the saved publications matching the selected place and evidence controls.',
        ),
        el('p', { role: 'status', 'data-export-status': true }, exportMessage),
      ),
    );
    const list = el('ol', { class: 'place-publications' });
    for (const work of works) {
      const associations = links.filter((link) => link.work.id === work.id);
      const row = el(
        'li',
        { class: 'place-publication', 'data-place-work': work.id },
        el(
          'button',
          { class: 'place-publication-title', onclick: () => onInspect(work) },
          work.title,
        ),
      );
      for (const link of associations)
        row.append(
          el(
            'div',
            { class: 'place-association' },
            el(
              'button',
              { class: 'text-button', onclick: () => onChoose(link.place.id) },
              icon('map-pin'),
              link.place.name,
            ),
            el(
              'p',
              { class: 'scope-note' },
              link.status === 'confirmed'
                ? `Researcher-confirmed${link.method === 'researcher' ? ' · assigned manually' : ''}`
                : `Suggested · name found in ${link.evidence.field}`,
            ),
            link.evidence && el('blockquote', {}, link.evidence.text),
            el(
              'div',
              { class: 'place-publication-actions' },
              link.status === 'suggested' &&
                el(
                  'button',
                  { class: 'text-button', onclick: () => review(link, 'confirmed') },
                  'Confirm association',
                ),
              el(
                'button',
                { class: 'text-button', onclick: () => review(link, 'rejected') },
                'Reject association',
              ),
            ),
          ),
        );
      list.append(row);
    }
    if (works.length) root.append(list);
    else
      root.append(
        el(
          'p',
          {},
          getSaved().size
            ? 'No saved publications match these place and evidence controls. Assign a place below or switch to Discover in Crossref.'
            : 'Save publications from Explore or Discover in Crossref to build a place-based bibliography.',
        ),
      );
    const publication = el(
      'select',
      { id: 'assignPlaceWork' },
      [...getSaved().values()].map(({ work }) =>
        el('option', { value: work.id }, work.title.slice(0, 160)),
      ),
    );
    const target = el(
      'select',
      { id: 'assignPlaceTarget' },
      [...sites]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((site) => el('option', { value: site.id, selected: selected === site.id }, site.name)),
    );
    const assignment = el(
      'details',
      { class: 'place-assignment' },
      el('summary', {}, 'Assign a place to a saved publication'),
      el(
        'p',
        { class: 'scope-note' },
        'Use your reading of the publication when its title or abstract does not provide enough evidence. Your assignment is recorded as researcher-supplied.',
      ),
      el(
        'form',
        {
          class: 'place-search-form',
          onsubmit: (event) => {
            event.preventDefault();
            const work = getSaved().get(publication.value)?.work,
              place = sites.find((site) => site.id === target.value);
            if (!work || !place) return;
            decide(`place-scope:${work.id}`, { decision: 'place-specific' });
            decide(`place:${work.id}:${place.id}`, {
              decision: 'confirmed',
              method: 'researcher',
              doi: work.id,
              place: place.id,
              source: place.source,
            });
            selected = place.id;
            onChoose(place.id);
          },
        },
        el('label', { for: 'assignPlaceWork' }, 'Saved publication', publication),
        el('label', { for: 'assignPlaceTarget' }, 'Ancient place', target),
        el(
          'button',
          { class: 'button', type: 'submit', disabled: !getSaved().size },
          'Assign place',
        ),
      ),
    );
    root.append(assignment);
    assignment.open = assignmentOpen || false;
    if (draftWork && getSaved().has(draftWork)) publication.value = draftWork;
    if (draftTarget && sites.some((site) => site.id === draftTarget)) target.value = draftTarget;
    if (draftFormat) format.value = draftFormat;
    function workList(title, rows, decision) {
      const list = el('ul', { class: 'place-review-works' });
      for (const work of rows)
        list.append(
          el(
            'li',
            {},
            el('button', { class: 'text-button', onclick: () => onInspect(work) }, work.title),
            el(
              'button',
              {
                class: 'text-button',
                onclick: () => {
                  if (decision === 'assign') {
                    assignment.open = true;
                    publication.value = work.id;
                    target.focus();
                  } else {
                    decide(`place-scope:${work.id}`, { decision: 'unassigned' });
                    refresh();
                  }
                },
              },
              decision === 'assign' ? 'Assign a place' : 'Reset classification',
            ),
            decision === 'assign' &&
              el(
                'button',
                {
                  class: 'text-button',
                  onclick: () => {
                    decide(`place-scope:${work.id}`, { decision: 'not-place-specific' });
                    refresh();
                  },
                },
                'Not place-specific',
              ),
          ),
        );
      root.append(
        el(
          'details',
          { class: 'places-source' },
          el('summary', {}, `${title} (${rows.length})`),
          list,
        ),
      );
    }
    workList('No place assigned', snapshot.unassigned, 'assign');
    workList('Not place-specific', snapshot.notSpecific, 'reset');
    if (snapshot.rejected.length)
      root.append(
        el(
          'details',
          { class: 'places-source' },
          el('summary', {}, `Rejected associations (${snapshot.rejected.length})`),
          el(
            'ul',
            { class: 'place-review-works' },
            snapshot.rejected.map((link) =>
              el(
                'li',
                {},
                `${link.work.title} · ${link.place.name}`,
                el(
                  'button',
                  {
                    class: 'text-button',
                    onclick: () => review(link, link.evidence ? 'suggested' : 'confirmed'),
                  },
                  'Restore association',
                ),
              ),
            ),
          ),
        ),
      );
  }
  return {
    render,
    stats,
    cancel() {
      exportJob?.abort();
    },
  };
}
