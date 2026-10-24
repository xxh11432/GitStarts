export const PUBLIC_API_BASE = '/api';
export const CSRF_COOKIE = 'XSRF-TOKEN';
export const CSRF_HEADER = 'X-XSRF-TOKEN';

/**
 * 只允许站内相对路径，防止开放重定向。
 */
export function safeNext(next?: string | null): string {
  if (!next) {
    return '/';
  }
  const value = next.trim();
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')
      || value.includes('\n') || value.includes('\r') || value.length > 512) {
    return '/';
  }
  return value;
}

export function loginHref(next?: string | null): string {
  return `${PUBLIC_API_BASE}/auth/github/login?next=${encodeURIComponent(safeNext(next))}`;
}

/** 未登录时引导到登录页，登录成功后回跳 */
export function redirectToLogin(next?: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.location.href = `/login?next=${encodeURIComponent(safeNext(next))}`;
}

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') {
    return undefined;
  }
  const prefix = `${name}=`;
  const found = document.cookie.split('; ').find((row) => row.startsWith(prefix));
  return found ? decodeURIComponent(found.slice(prefix.length)) : undefined;
}

/**
 * 取 CSRF token：优先读 Cookie；没有则请求 /api/auth/csrf 让后端下发。
 */
export async function ensureCsrfToken(): Promise<string> {
  const existing = readCookie(CSRF_COOKIE);
  if (existing) {
    return existing;
  }
  const res = await fetch(`${PUBLIC_API_BASE}/auth/csrf`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`无法获取 CSRF token：${res.status}`);
  }
  const data = (await res.json()) as { token: string };
  return data.token;
}

export async function logout(): Promise<void> {
  const token = await ensureCsrfToken();
  const res = await fetch(`${PUBLIC_API_BASE}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
    headers: { [CSRF_HEADER]: token },
  });
  if (!res.ok) {
    throw new Error(`退出失败：${res.status}`);
  }
}
