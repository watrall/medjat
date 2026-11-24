import { citationLine, citationText } from './citation-line.js';
import { el } from './dom.js';

export function publicationMetadata(work) {
  return el('p', { class: 'scope-note publication-identity' }, citationLine(work, { doi: true }));
}
export function assignmentLabel(work) {
  return `${work.title} (${citationText(work, { doi: true })})`;
}
