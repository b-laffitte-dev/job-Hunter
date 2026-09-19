export interface JobOffer {
  id: string;
  source: string;
  title: string;
  company: string | null;
  location: string | null;
  url: string;
  description: string | null;
  contractType: string | null;
  salary: string | null;
  publishedAt: string | null;
  rawFetchedAt: string;
  score?: number;
  scoreReasons?: string[];
}

export interface ScoredJob extends JobOffer {
  score: number;
  scoreReasons: string[];
  expandedKeywords: string[];
}

export interface KeywordExpansion {
  original: string;
  expanded: string[];
  synonyms: string[];
  relatedTerms: string[];
}

export type SourceType = "francetravail" | "indeed" | "leboncoin" | "generic";

export interface SourceConfig {
  name: string;
  type: SourceType;
  enabled: boolean;
  baseUrl?: string;
  needsPuppeteer?: boolean;
}

export interface SearchConfig {
  query: string;
  location: string;
  maxResultsPerSource: number;
  minScore: number;
}

export interface CriteriaConfig {
  keywords: string[];
  excludeKeywords: string[];
  experience: string;
  contractTypes: string[];
  remoteOk: boolean;
  maxSalary: number | null;
}

export interface AppConfig {
  search: SearchConfig;
  criteria: CriteriaConfig;
  sources: SourceConfig[];
}
