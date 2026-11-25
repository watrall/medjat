export interface Query {
  [key: string]: string | boolean;
  q: string;
  container: string;
  field?: 'author' | 'doi';
  period: string;
  context: boolean;
  type: string;
  from: string;
  to: string;
  abstract: boolean;
  orcid: boolean;
  references: boolean;
  access: '' | 'open';
  sort: 'relevance' | 'newest' | 'oldest';
}
