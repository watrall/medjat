export function readPlaceState(params) {
  return {
    place: params.get('place') || '',
    mode: params.get('placesMode') === 'collection' ? 'collection' : 'discover',
    term: (params.get('placeName') || '').slice(0, 120),
    topic: (params.get('placeTopic') || '').slice(0, 300),
    status: ['confirmed', 'suggested'].includes(params.get('placeEvidence'))
      ? params.get('placeEvidence')
      : 'all',
  };
}
export function writePlaceState(params, state) {
  for (const [key, value] of Object.entries({
    place: state.place,
    placesMode: state.mode === 'collection' ? 'collection' : '',
    placeName: state.term,
    placeTopic: state.topic,
    placeEvidence: state.status === 'all' ? '' : state.status,
  }))
    if (value) params.set(key, value);
}
