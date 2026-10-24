import { cookies } from 'next/headers';
import type { CompareResultView, ComparisonDetail, ComparisonSummary } from './compare';
import type {
  ConversationDetail,
  ConversationSummary,
  FavoriteStatus,
  FavoriteView,
  IdeaView,
  Me,
  MetaResponse,
  PageResult,
  Profile,
  ReadmeSummary,
  Recommendation,
  Repo,
} from './types';

const INTERNAL = process.env.API_INTERNAL_URL;
export const API_BASE = INTERNAL ? `${INTERNAL}/api` : '/api';

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`请求失败：${res.status}`);
  }
  return res.json();
}

export interface ListParams {
  q?: string;
  category?: string;
  language?: string;
  topic?: string;
  platform?: string;
  license?: string;
  sort?: string;
  order?: string;
  page?: number;
  size?: number;
}

export async function fetchRepos(params: ListParams): Promise<PageResult<Repo>> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      qs.set(key, String(value));
    }
  });
  const suffix = qs.toString();
  return getJson(`${API_BASE}/repos${suffix ? `?${suffix}` : ''}`);
}

export async function fetchRank(type = 'total', language?: string, limit = 20): Promise<Repo[]> {
  const qs = new URLSearchParams();
  qs.set('type', type);
  if (language) {
    qs.set('language', language);
  }
  qs.set('limit', String(limit));
  return getJson(`${API_BASE}/repos/rank?${qs.toString()}`);
}

export async function fetchMeta(): Promise<MetaResponse> {
  return getJson(`${API_BASE}/meta`);
}

export async function fetchRepo(fullName: string): Promise<Repo> {
  return getJson(`${API_BASE}/repos/${fullName}`);
}

export async function fetchRepoSummary(fullName: string): Promise<ReadmeSummary> {
  return getJson(`${API_BASE}/repos/${fullName}/readme`);
}

export async function fetchSimilarRepos(fullName: string, limit = 6): Promise<Repo[]> {
  return getJson(`${API_BASE}/repos/similar/${fullName}?limit=${limit}`);
}

/**
 * 服务端读取只读分享的对比：无需登录，且只返回这一条对比。
 */
export async function fetchSharedComparison(token: string): Promise<{
  repoKeys: string[];
  schemaVersion: string;
  result: CompareResultView;
  createdAt?: string;
}> {
  if (!/^[a-f0-9]{32}$/i.test(token)) {
    throw new Error('分享链接无效');
  }
  return getJson(`${API_BASE}/comparisons/share/${token}`);
}

/**
 * 服务端读取当前登录用户的个人数据：透传会话 Cookie，未登录或失败时返回 null。
 */
async function getAuthedJson<T>(path: string): Promise<T | null> {
  const cookieHeader = cookies().toString();
  if (!cookieHeader) {
    return null;
  }
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    });
    if (!res.ok) {
      return null;
    }
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchMyIdeas(page = 1, size = 20): Promise<PageResult<IdeaView> | null> {
  return getAuthedJson(`/ideas?page=${page}&size=${size}`);
}

export async function fetchMyComparisons(page = 1, size = 20): Promise<PageResult<ComparisonSummary> | null> {
  return getAuthedJson(`/comparisons?page=${page}&size=${size}`);
}

export async function fetchComparison(id: string | number): Promise<ComparisonDetail | null> {
  return getAuthedJson(`/comparisons/${id}`);
}

export async function fetchMyFavorites(page = 1, size = 20): Promise<PageResult<FavoriteView> | null> {
  return getAuthedJson(`/favorites?page=${page}&size=${size}`);
}

export async function fetchFavoriteStatus(fullName: string): Promise<FavoriteStatus | null> {
  return getAuthedJson(`/favorites/status?fullName=${encodeURIComponent(fullName)}`);
}

export async function fetchProfile(): Promise<Profile | null> {
  return getAuthedJson('/profile');
}

export async function fetchRecommendations(limit = 6): Promise<Recommendation[] | null> {
  return getAuthedJson(`/profile/recommendations?limit=${limit}`);
}

export async function fetchMyConversations(page = 1, size = 20): Promise<PageResult<ConversationSummary> | null> {
  return getAuthedJson(`/conversations?page=${page}&size=${size}`);
}

export async function fetchConversation(id: string | number): Promise<ConversationDetail | null> {
  return getAuthedJson(`/conversations/${id}`);
}

/**
 * 服务端读取当前登录用户：把浏览器会话 Cookie 透传给 backend。
 * 未登录或后端不可用时返回 null，页面按匿名处理。
 */
export async function fetchMe(): Promise<Me | null> {
  const cookieHeader = cookies().toString();
  if (!cookieHeader) {
    return null;
  }
  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    });
    if (!res.ok) {
      return null;
    }
    return (await res.json()) as Me;
  } catch {
    return null;
  }
}
