import { authorLine } from './data.js';
import { el } from './dom.js';

export function publicationIdentity(work) {
  return [
    authorLine(work),
    work.year || 'Date not supplied',
    work.container || work.typeLabel,
    work.doi,
  ]
    .filter(Boolean)
    .join(' · ');
}
export function publicationMetadata(work) {
  return el('p', { class: 'scope-note publication-identity' }, publicationIdentity(work));
}
export function assignmentLabel(work) {
  return `${work.title} · ${publicationIdentity(work)}`;
}
