import {
  CSRF_HEADER,
  PUBLIC_API_BASE,
  ensureCsrfToken,
  redirectToLogin,
} from './client';
import type { FavoriteView, Profile } from './types';

async function request<T>(path: string, method: string, body?: unknown): Promise<T> {
  const token = await ensureCsrfToken();
  const headers: Record<string, string> = { [CSRF_HEADER]: token };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(`${PUBLIC_API_BASE}${path}`, {
    method,
    credentials: 'include',
    cache: 'no-store',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let payload: Record<string, unknown> = {};
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }
  if (!response.ok) {
    if (response.status === 401) {
      redirectToLogin('/me');
    }
    throw new Error(
      typeof payload.message === 'string' ? payload.message : `请求失败（${response.status}）`,
    );
  }
  return payload as T;
}

export async function addFavorite(fullName: string, note?: string): Promise<FavoriteView> {
  return request<FavoriteView>('/favorites', 'POST', { fullName, note: note ?? null });
}

export async function removeFavorite(id: number): Promise<void> {
  await request('/favorites/' + id, 'DELETE');
}

export async function updateFavoriteNote(id: number, note: string): Promise<FavoriteView> {
  return request<FavoriteView>(`/favorites/${id}`, 'PATCH', { note });
}

export async function saveProfile(profile: Profile): Promise<Profile> {
  return request<Profile>('/profile', 'PUT', {
    skills: profile.skills,
    interests: profile.interests,
    preferences: profile.preferences,
  });
}

export async function revokeComparisonShare(id: number): Promise<void> {
  await request(`/comparisons/${id}/share/revoke`, 'POST');
}

export async function deleteComparison(id: number): Promise<void> {
  await request(`/comparisons/${id}`, 'DELETE');
}

export async function deleteConversation(id: number): Promise<void> {
  await request(`/conversations/${id}`, 'DELETE');
}

export async function deleteAccount(): Promise<void> {
  await request('/account', 'DELETE');
}
