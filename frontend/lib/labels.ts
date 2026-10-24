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
