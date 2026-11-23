import { placeEvidence } from './place-data.js';
import { publicationMetadata } from './place-publication.js';
import { displayTitle, doiURL } from './data.js';
import { el, externalLink, icon } from './dom.js';

export function createPlacePublicationRow(work, { place, isSaved, onInspect, onSave, onSync }) {
  const evidence = placeEvidence(work, place);
  const saved = isSaved(work.id);
  const save = el(
    'button',
    {
      class: 'text-button',
      'aria-pressed': String(saved),
      onclick: async () => {
        save.disabled = true;
        try {
          await onSave(work);
          const current = isSaved(work.id);
          save.textContent = current ? 'Remove from collection' : 'Save to collection';
          save.setAttribute('aria-pressed', String(current));
        } finally {
          save.disabled = false;
          onSync();
        }
      },
    },
    icon(saved ? 'bookmark-check' : 'bookmark'),
    saved ? 'Remove from collection' : 'Save to collection',
  );
  return el(
    'li',
    { class: 'place-publication', 'data-place-work': work.id },
    el(
      'button',
      { class: 'place-publication-title', onclick: () => onInspect(work) },
      displayTitle(work.title),
    ),
    publicationMetadata(work),
    evidence &&
      el(
        'p',
        { class: 'place-evidence-label' },
        icon('map-pin'),
        `“${evidence.alias}” mentioned in ${evidence.field}. Relevance needs review.`,
      ),
    evidence && el('blockquote', {}, evidence.text),
    el(
      'div',
      { class: 'place-publication-actions' },
      save,
      externalLink('Open publication', doiURL(work.doi)),
    ),
  );
}
