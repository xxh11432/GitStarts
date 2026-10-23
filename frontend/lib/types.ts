export interface FacetItem {
  name: string;
  slug: string;
  count: number;
}

export interface MetaResponse {
  categories: FacetItem[];
  languages: FacetItem[];
  topics: FacetItem[];
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
  defaultBranch?: string;
  pushedAt?: string;
  createdAt?: string;
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}
