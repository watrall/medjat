import { authorLine } from './data.js';
import { el, icon } from './dom.js';

export function createResultRow(
  work,
  { view, selected, saved, selectedForExport, onOpen, onSave, onSelectionChange },
) {
  const title = el(
    'button',
    {
      class: 'result-open',
      onclick: () => onOpen(work),
      'aria-label': `Inspect ${work.title}`,
    },
    work.title,
  );
  const badges = [
    work.abstract && ['file-text', 'Abstract'],
    work.authors.some((author) => author.orcid) && ['user-round', 'ORCID'],
    work.references.length > 0 && ['network', `${work.references.length} references`],
  ].filter(Boolean);
  return el(
    'li',
    {
      class: `result-row${selected ? ' is-selected' : ''}`,
      'data-record': work.id,
    },
    el(
      'div',
      { class: 'result-top' },
      view === 'collection' &&
        el(
          'label',
          { class: 'select-publication' },
          el('input', {
            type: 'checkbox',
            checked: selectedForExport,
            'aria-label': `Select publication: ${work.title}`,
            onchange: (event) => onSelectionChange(work.id, event.target.checked),
          }),
        ),
      el(view === 'collection' ? 'h2' : 'h3', {}, title),
      el(
        'button',
        {
          class: 'save-button',
          'aria-pressed': String(saved),
          'aria-label': `${saved ? 'Remove from' : 'Save to'} collection: ${work.title}`,
          onclick: () => onSave(work),
        },
        icon(saved ? 'bookmark-check' : 'bookmark'),
        el('span', {}, saved ? 'Saved' : 'Save'),
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
}
