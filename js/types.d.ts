export interface Author {
  name: string;
  orcid: string;
  affiliations: string[];
}

export interface Work {
  id: string;
  doi: string;
  title: string;
  authors: Author[];
  year: number | null;
  container: string;
  type: string;
  typeLabel: string;
  abstract: string;
  publisher: string;
  volume: string;
  issue: string;
  pages: string;
  references: Record<string, unknown>[];
  relations: Record<string, unknown[]>;
  funders: Record<string, unknown>[];
  licenses: Record<string, unknown>[];
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
  period: string;
  type: string;
  from: string;
  to: string;
  abstract: boolean;
  orcid: boolean;
  references: boolean;
  sort: 'relevance' | 'newest' | 'oldest';
}

export type ResearchDecisions = Record<string, Record<string, unknown>>;
