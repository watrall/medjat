import { publicationMetadata } from './place-publication.js';
import { el } from './dom.js';

export function createPlaceReviewList({
  title,
  rows,
  mode,
  onInspect,
  onAssign,
  onReset,
  onClassify,
}) {
  const list = el('ul', { class: 'place-review-works' });
  for (const work of rows)
    list.append(
      el(
        'li',
        { 'data-place-work': work.id },
        el('button', { class: 'text-button', onclick: () => onInspect(work) }, work.title),
        publicationMetadata(work),
        el(
          'button',
          {
            class: 'text-button',
            onclick: () => (mode === 'assign' ? onAssign(work) : onReset(work)),
          },
          mode === 'assign' ? 'Assign a place' : 'Reset classification',
        ),
        mode === 'assign' &&
          el(
            'button',
            { class: 'text-button', onclick: () => onClassify(work) },
            'Not place-specific',
          ),
      ),
    );
  return el(
    'details',
    { class: 'places-source' },
    el('summary', {}, `${title} (${rows.length})`),
    list,
  );
}
