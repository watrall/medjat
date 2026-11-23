import { el } from './dom.js';
import { NOTE_LIMIT, TAG_LENGTH, parseTags } from './annotations.js';

export function createNotesForm(idPrefix, current, onSave) {
  const note = el('textarea', { id: `${idPrefix}-note`, rows: 4, maxlength: NOTE_LIMIT });
  note.value = current.note;
  const tags = el('input', {
    id: `${idPrefix}-tags`,
    type: 'text',
    maxlength: 600,
    'data-focus-key': 'tags',
  });
  tags.value = current.tags.join(', ');
  const status = el('p', { class: 'scope-note', role: 'status' });
  return el(
    'form',
    {
      class: 'notes-form',
      onsubmit: (event) => {
        event.preventDefault();
        const saved = { note: note.value, tags: parseTags(tags.value) };
        onSave(saved);
        tags.value = saved.tags.join(', ');
        status.textContent = 'Notes saved in this browser. Exports and JSON backups include them.';
      },
    },
    el('label', { for: `${idPrefix}-note` }, 'Note', note),
    el(
      'label',
      { for: `${idPrefix}-tags` },
      `Tags (separate with commas, up to ${TAG_LENGTH} characters each)`,
      tags,
    ),
    el('button', { class: 'button', type: 'submit' }, 'Save notes'),
    status,
  );
}
