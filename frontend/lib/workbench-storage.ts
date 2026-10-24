export const MATCH_STATE_KEY = 'gitstars:match-state:v1';
export const COMPARE_STATE_KEY = 'gitstars:compare-state:v1';

/**
 * 工作台状态只保存在当前标签页：切换页面后再回来仍能恢复结果。
 * sessionStorage 不可用时静默降级，不影响主流程。
 */
export function readState<T>(key: string): T | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeState(key: string, value: unknown): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 配额不足或隐私模式：忽略，页面仍可正常使用
  }
}

export function clearState(key: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}
