import { cookies } from 'next/headers';
import type { Me, MetaResponse, PageResult, ReadmeSummary, Repo } from './types';

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
