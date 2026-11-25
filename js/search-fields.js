// The fields the search box can look in. `param` is the Crossref query parameter; DOI is an exact
// lookup, so it has none. The default entry (empty id) searches all bibliographic metadata.
export const SEARCH_FIELDS = [
  {
    id: '',
    label: 'All metadata',
    param: 'query.bibliographic',
    placeholder: 'Search publications',
    hint: 'Search publication metadata in Crossref. Paste a DOI for an exact record.',
  },
  {
    id: 'title',
    label: 'Title',
    param: 'query.title',
    placeholder: 'Search titles',
    hint: 'Search publication titles in Crossref, with your selected research context.',
  },
  {
    id: 'author',
    label: 'Author',
    param: 'query.author',
    placeholder: 'Search author names',
    hint: 'Search author names in Crossref, with your selected research context.',
  },
  {
    id: 'editor',
    label: 'Editor',
    param: 'query.editor',
    placeholder: 'Search editor names',
    hint: 'Search editor names in Crossref, with your selected research context.',
  },
  {
    id: 'journal',
    label: 'Journal or book',
    param: 'query.container-title',
    placeholder: 'Search journal, book or series titles',
    hint: 'Search journal, book and series titles in Crossref, with your selected research context.',
  },
  {
    id: 'publisher',
    label: 'Publisher',
    param: 'query.publisher-name',
    placeholder: 'Search publisher names',
    hint: 'Search publisher names in Crossref, with your selected research context.',
  },
  {
    id: 'affiliation',
    label: 'Institution',
    param: 'query.affiliation',
    placeholder: 'Search author institutions',
    hint: 'Search author institutions in Crossref. Only some records list an institution.',
  },
  {
    id: 'funder',
    label: 'Funder',
    param: 'query.funder-name',
    placeholder: 'Search funder names',
    hint: 'Search funder names in Crossref. Only a few records list a funder.',
  },
  {
    id: 'doi',
    label: 'DOI',
    param: '',
    placeholder: 'Enter a DOI',
    hint: 'Look up one exact Crossref record. Publication refinements do not apply.',
  },
];

export const searchField = (id) =>
  SEARCH_FIELDS.find((field) => field.id === id) ?? SEARCH_FIELDS[0];
export const isSearchFieldId = (id) =>
  Boolean(id) && SEARCH_FIELDS.some((field) => field.id === id);
// A named field with its own Crossref parameter: everything except All metadata and DOI.
export const isFieldSearch = (id) => {
  const field = searchField(id);
  return field.id !== '' && field.param !== '';
};
