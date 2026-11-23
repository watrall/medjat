export interface Author {
  name: string;
  orcid: string;
  affiliations: string[];
}

export interface WorkUpdate {
  doi: string;
  type: string;
  label: string;
  sources: string[];
  date: string;
}

export interface Work {
  id: string;
  doi: string;
  title: string;
  authors: Author[];
  editors: Author[];
  year: number | null;
  container: string;
  type: string;
  typeLabel: string;
  abstract: string;
  publisher: string;
  member: string;
  volume: string;
  issue: string;
  pages: string;
  references: Record<string, unknown>[];
  relations: Record<string, unknown[]>;
  partOf: string;
  funders: Record<string, unknown>[];
  licenses: Record<string, unknown>[];
  updates: WorkUpdate[];
  updateTo: WorkUpdate[];
  citedBy: number | null;
  deposited: string;
  raw: Record<string, unknown>;
}

export interface SavedRecord {
  work: Work;
  savedAt: string;
}

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
  sort: 'relevance' | 'newest' | 'oldest';
}

export type ResearchDecisions = Record<string, Record<string, unknown>>;
