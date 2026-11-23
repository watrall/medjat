const TYPES = {
  retraction: ['serious', 'Retracted'],
  withdrawal: ['serious', 'Withdrawn'],
  removal: ['serious', 'Removed'],
  partial_retraction: ['serious', 'Partly retracted'],
  expression_of_concern: ['serious', 'Expression of concern'],
  correction: ['minor', 'Correction'],
  corrigendum: ['minor', 'Correction'],
  erratum: ['minor', 'Correction'],
  addendum: ['minor', 'Addendum'],
  clarification: ['minor', 'Clarification'],
  new_version: ['neutral', 'New version'],
  new_edition: ['neutral', 'New edition'],
};
export const SEVERITY_RANK = { serious: 0, minor: 1, neutral: 2 };
const SOURCES = { publisher: 'the publisher', 'retraction-watch': 'Retraction Watch' };

export const updateSeverity = (type) => TYPES[type]?.[0] ?? 'neutral';
export const updateLabel = (update) => TYPES[update.type]?.[1] ?? (update.label || 'Update');
export const sourceLabel = (source) => SOURCES[source] ?? source;

export const reportableUpdates = (updates) =>
  updates.filter((update) => updateSeverity(update.type) !== 'neutral');

export function noticeLabel(update) {
  const text = update.type.replaceAll('_', ' ');
  return `${text[0].toUpperCase()}${text.slice(1)} notice`;
}
