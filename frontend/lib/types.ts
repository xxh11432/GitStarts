export interface FacetItem {
  name: string;
  slug: string;
  count: number;
}

export interface MetaResponse {
  categories: FacetItem[];
  languages: FacetItem[];
  topics: FacetItem[];
  platforms: FacetItem[];
}

export interface Repo {
  id: number;
  fullName: string;
  name: string;
  owner: string;
  description?: string;
  homepage?: string;
  language?: string;
  license?: string;
  stars: number;
  forks: number;
  watchers: number;
  openIssues: number;
  topics: string[];
  category?: string;
  platform?: string;
  defaultBranch?: string;
  pushedAt?: string;
  createdAt?: string;
}

export interface ReadmeSummary {
  fullName: string;
  summary?: string;
  sourceUrl: string;
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

export interface QuotaView {
  used: number;
  limit: number;
}

export interface Quota {
  chat: QuotaView;
  compare: QuotaView;
  resetAt: string;
}

export interface Me {
  id: number;
  nickname?: string;
  avatarUrl?: string;
  quota: Quota;
}
