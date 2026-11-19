import { PERIODS, TYPES } from './data.js';

export const FILTER_CONTROLS = Object.freeze([
  { key: 'period', id: 'periodSelect' },
  { key: 'from', id: 'yearFrom' },
  { key: 'to', id: 'yearTo' },
  { key: 'type', id: 'typeFilter' },
  { key: 'abstract', id: 'hasAbstract', checked: true },
  { key: 'orcid', id: 'hasOrcid', checked: true },
  { key: 'references', id: 'hasReferences', checked: true },
]);

export function readFilterControls(document) {
  const values = {};
  for (const filter of FILTER_CONTROLS) {
    const control = document.getElementById(filter.id);
    values[filter.key] = filter.checked ? control.checked : control.value;
  }
  return values;
}

export function writeFilterControls(document, query) {
  for (const filter of FILTER_CONTROLS) {
    const control = document.getElementById(filter.id);
    if (filter.checked) control.checked = Boolean(query[filter.key]);
    else control.value = query[filter.key];
  }
}

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

export function filterChips(query) {
  const period = PERIODS.find((entry) => entry.id === query.period);
  return [
    period && `Period keywords: ${period.name}`,
    query.type && TYPES.get(query.type),
    query.container && `Venue: ${query.container}`,
    query.from && `From ${query.from}`,
    query.to && `To ${query.to}`,
    query.abstract && 'Has abstract',
    query.orcid && 'Has ORCID',
    query.references && 'Has references',
  ].filter(Boolean);
}

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
