// @ts-check
import { PERIODS, TYPES } from './data.js';

/** @typedef {import('./types.js').Query} Query */

export const FILTER_CONTROLS = Object.freeze([
  { key: 'period', id: 'periodSelect' },
  { key: 'context', id: 'addEgyptContext', checked: true },
  { key: 'from', id: 'yearFrom' },
  { key: 'to', id: 'yearTo' },
  { key: 'type', id: 'typeFilter', radio: true },
  { key: 'abstract', id: 'hasAbstract', checked: true },
  { key: 'orcid', id: 'hasOrcid', checked: true },
  { key: 'references', id: 'hasReferences', checked: true },
]);

/**
 * @param {Document} document
 * @param {string} id
 * @returns {HTMLInputElement | HTMLSelectElement}
 */
function control(document, id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing filter control: ${id}`);
  return /** @type {HTMLInputElement | HTMLSelectElement} */ (element);
}

/** @param {Document} document @returns {Record<string, string | boolean>} */
export function readFilterControls(document) {
  /** @type {Record<string, string | boolean>} */
  const values = {};
  for (const filter of FILTER_CONTROLS) {
    const element = control(document, filter.id);
    if (filter.radio) {
      values[filter.key] =
        document.querySelector('input[name="publicationType"]:checked')?.getAttribute('value') ||
        '';
      continue;
    }
    values[filter.key] = filter.checked
      ? /** @type {HTMLInputElement} */ (element).checked
      : element.value;
  }
  return values;
}

/** @param {Document} document @param {Query} query */
export function writeFilterControls(document, query) {
  for (const filter of FILTER_CONTROLS) {
    const element = control(document, filter.id);
    const value = query[filter.key];
    if (filter.radio) {
      for (const radio of document.querySelectorAll('input[name="publicationType"]'))
        /** @type {HTMLInputElement} */ (radio).checked =
          radio.getAttribute('value') === (value || '');
      continue;
    }
    if (filter.checked)
      /** @type {HTMLInputElement} */ (element).checked = Boolean(value);
    else element.value = String(value ?? '');
  }
}

/** @param {Query} query @returns {string[]} */
export function queryFilters(query) {
  const filters = [];
  if (query.container) filters.push(`container-title:${query.container}`);
  if (query.type) filters.push(`type:${query.type}`);
  if (query.from) filters.push(`from-pub-date:${query.from}-01-01`);
  if (query.to) filters.push(`until-pub-date:${query.to}-12-31`);
  if (query.abstract) filters.push('has-abstract:true');
  if (query.orcid) filters.push('has-orcid:true');
  if (query.references) filters.push('has-references:true');
  return filters;
}

/** @param {Query} query */
export function filterEntries(query) {
  const period = PERIODS.find((entry) => entry.id === query.period);
  return [
    { key: 'period', label: period && `Period keywords: ${period.name}` },
    { key: 'type', label: query.type && TYPES.get(query.type) },
    { key: 'container', label: query.container && `Venue: ${query.container}` },
    { key: 'from', label: query.from && `From ${query.from}` },
    { key: 'to', label: query.to && `To ${query.to}` },
    { key: 'abstract', label: query.abstract && 'Has abstract' },
    { key: 'orcid', label: query.orcid && 'Has ORCID' },
    { key: 'references', label: query.references && 'Has references' },
    { key: 'access', label: query.access === 'open' && 'Open access (loaded results)' },
  ].filter((entry) => typeof entry.label === 'string' && entry.label.length > 0);
}

/** @param {Query} query @returns {string[]} */
export function filterChips(query) {
  return filterEntries(query).map((entry) => /** @type {string} */ (entry.label));
}

/** @param {Query} query @returns {string} */
export function filterDescription(query) {
  return (
    [
      (query.from || query.to) &&
        `Publication years: ${query.from || 'any'} to ${query.to || 'any'}`,
      query.type && `Type: ${TYPES.get(query.type) || query.type}`,
      query.container && `Venue: ${query.container}`,
      query.abstract && 'Abstract required',
      query.orcid && 'Author ORCID required',
      query.references && 'References required',
    ]
      .filter(Boolean)
      .join(' · ') || 'No additional publication filters'
  );
}
