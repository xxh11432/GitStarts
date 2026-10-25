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
  platforms?: string[];
  latestReleaseTag?: string;
  latestReleaseAt?: string;
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

export interface IdeaView {
  id: number;
  title?: string;
  rawText: string;
  structured: Record<string, unknown>;
  revision: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface FavoriteView {
  id: number;
  repo: Repo;
  note?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface FavoriteStatus {
  favorited: boolean;
  id?: number;
  note?: string;
}

export interface Profile {
  skills: string[];
  interests: string[];
  preferences: string[];
  updatedAt?: string;
}

export interface Recommendation {
  repo: Repo;
  reasons: string[];
}

export interface ConversationSummary {
  id: number;
  title?: string;
  mode: string;
  ideaId?: number;
  messageCount: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface MessageView {
  id: number;
  role: string;
  content?: string;
  refs?: unknown;
  createdAt?: string;
}

export interface ConversationDetail {
  conversation: ConversationSummary;
  messages: MessageView[];
}

export interface OpsMetricsDay {
  day: string;
  chatCount: number;
  matchCount: number;
  compareCount: number;
  tokensIn: number;
  tokensOut: number;
  requests: number;
  errors: number;
  p95Ms?: number;
  p95ByKind: Record<string, number>;
}

export interface OpsMetricsTotals {
  chatCount: number;
  matchCount: number;
  compareCount: number;
  tokensIn: number;
  tokensOut: number;
  requests: number;
  errors: number;
  p95Ms?: number;
}

export interface OpsBudgetAlert {
  code: string;
  day: string;
  value: number;
  threshold: number;
}

export interface OpsMetrics {
  from: string;
  to: string;
  days: OpsMetricsDay[];
  totals: OpsMetricsTotals;
  budgets: {
    dailyTokens: number;
    dailyCompares: number;
    p95ChatMs: number;
    p95MatchMs: number;
    p95CompareMs: number;
  };
  alerts: OpsBudgetAlert[];
}
