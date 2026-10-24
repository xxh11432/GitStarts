export const COMPARE_STORAGE_KEY = 'gitstars:compare-repos';
export const BASKET_CHANGE_EVENT = 'gitstars:basket-change';
export const BASKET_LIMIT = 4;

export function readBasket(): string[] {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(COMPARE_STORAGE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((item): item is string => typeof item === 'string' && /^[\w.-]+\/[\w.-]+$/.test(item))
      .slice(-BASKET_LIMIT);
  } catch {
    return [];
  }
}

function writeBasket(repos: string[]): string[] {
  const merged = Array.from(new Set(repos.filter(Boolean))).slice(-BASKET_LIMIT);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(merged));
      window.dispatchEvent(new Event(BASKET_CHANGE_EVENT));
    } catch {
      // ignore
    }
  }
  return merged;
}

/** 合并加入对比篮，最多保留 4 个；返回合并后的列表。 */
export function addReposToBasket(repos: string[]): string[] {
  return writeBasket([...readBasket(), ...repos]);
}

/** 单个仓库加入/移出对比篮，返回是否已在篮中。 */
export function toggleRepoInBasket(fullName: string): boolean {
  const current = readBasket();
  const exists = current.includes(fullName);
  writeBasket(exists ? current.filter((item) => item !== fullName) : [...current, fullName]);
  return !exists;
}

export function removeRepoFromBasket(fullName: string): string[] {
  return writeBasket(readBasket().filter((item) => item !== fullName));
}

export function clearBasket(): string[] {
  return writeBasket([]);
}

/** 跳到对比工作台；仓库列表放在 URL 上，避免依赖旧缓存。 */
export function compareHref(repos: string[], ideaId?: number | null): string {
  const params = new URLSearchParams({ repos: repos.join(',') });
  if (ideaId) {
    params.set('ideaId', String(ideaId));
  }
  return `/compare?${params.toString()}`;
}
