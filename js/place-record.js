import { placeSource } from './place-data.js';
import { dateRange, fetchPleiadesRecord } from './pleiades-record.js';
import { el, externalLink } from './dom.js';

export function createPlaceRecord(place, { open = false } = {}) {
  const body = el('div', {}, el('p', { role: 'status' }, 'Loading the Pleiades record…'));
  const block = el(
    'details',
    { class: 'places-source place-record', open },
    el('summary', {}, 'About this place, from Pleiades'),
    body,
  );
  fetchPleiadesRecord(place.id).then(
    (record) => {
      const range = dateRange(record);
      const facts = [
        record.types.length && ['Type', record.types.join(', ')],
        range && ['Attested', `${range}, from its Pleiades location records`],
        record.names && ['Names recorded', String(record.names)],
        place.precision && [
          'Location',
          place.precision === 'rough' ? 'Approximate' : 'Related to a nearby place',
        ],
      ].filter(Boolean);
      body.replaceChildren(
        record.description && el('p', {}, record.description),
        facts.length > 0 &&
          el(
            'dl',
            { class: 'place-facts' },
            facts.map(([term, value]) => [el('dt', {}, term), el('dd', {}, value)]),
          ),
        el(
          'p',
          { class: 'scope-note' },
          record.creators.length
            ? `Record by ${record.creators.join(', ')}, fetched from `
            : 'Fetched from ',
          externalLink('Pleiades', placeSource(place.id)),
          ' when you opened this place. CC BY 3.0.',
        ),
      );
    },
    () =>
      body.replaceChildren(
        el(
          'p',
          { class: 'scope-note' },
          'The Pleiades record could not be loaded. ',
          externalLink('Open it on Pleiades', placeSource(place.id)),
          '.',
        ),
      ),
  );
  return block;
}
