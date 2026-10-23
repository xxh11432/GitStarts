import type { MetaResponse, PageResult, Repo } from './types';

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
