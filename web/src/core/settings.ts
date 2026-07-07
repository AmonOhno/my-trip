const KEY = "my-trip-settings-v1";

export interface Settings {
  /** OSM Nominatim へ座標を送ってスポット名を自動取得するか */
  reverseGeocode: boolean;
}

const DEFAULTS: Settings = { reverseGeocode: true };

let cache: Settings | null = null;

export function getSettings(): Settings {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : { ...DEFAULTS };
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache;
}

export function saveSettings(next: Settings): void {
  cache = next;
  localStorage.setItem(KEY, JSON.stringify(next));
}
