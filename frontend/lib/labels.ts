export const PLATFORM_LABELS: Record<string, string> = {
  windows: 'Windows',
  mac: 'macOS',
  linux: 'Linux',
  android: 'Android',
  ios: 'iOS',
  harmony: 'HarmonyOS',
  extension: '浏览器扩展',
  other: '其他',
};

export function platformLabel(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  return PLATFORM_LABELS[value] ?? value;
}

/** 语言色点：参考 GitHub linguist 的常用配色。 */
const LANGUAGE_COLORS: Record<string, string> = {
  typescript: '#3178c6',
  javascript: '#f1e05a',
  python: '#3572a5',
  go: '#00add8',
  rust: '#dea584',
  java: '#b07219',
  'c++': '#f34b7d',
  c: '#555555',
  'c#': '#178600',
  php: '#4f5d95',
  ruby: '#701516',
  swift: '#f05138',
  kotlin: '#a97bff',
  shell: '#89e051',
  html: '#e34c26',
  css: '#563d7c',
  vue: '#41b883',
  svelte: '#ff3e00',
  dart: '#00b4ab',
  elixir: '#6e4a7e',
  haskell: '#5e5086',
  lua: '#000080',
  scala: '#c22d40',
  'jupyter notebook': '#da5b0b',
  'objective-c': '#438eff',
};

const FALLBACK_LANGUAGE_COLOR = '#8b949e';

export function languageColor(value?: string): string {
  if (!value) {
    return FALLBACK_LANGUAGE_COLOR;
  }
  return LANGUAGE_COLORS[value.trim().toLowerCase()] ?? FALLBACK_LANGUAGE_COLOR;
}
