import { getSettings } from "./settings";

/**
 * OSM Nominatim 逆ジオコーディング。
 * 利用ポリシー準拠: リクエストは直列 + 最低1.1秒間隔、結果はローカルにキャッシュ。
 * 失敗しても呼び出し側はスポット記録を続行できる(名前は後付け)。
 */

const CACHE_KEY = "my-trip-geocode-cache-v1";
const MIN_INTERVAL_MS = 1100;

type Cache = Record<string, string>;

function cacheKey(lat: number, lng: number): string {
  // ~110m 格子で丸めてキャッシュヒット率を上げる
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

function readCache(): Cache {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}") as Cache;
  } catch {
    return {};
  }
}

let queue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

async function throttled<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
    return task();
  });
  queue = run.catch(() => undefined);
  return run;
}

interface NominatimResponse {
  name?: string;
  display_name?: string;
  address?: Record<string, string>;
}

function pickName(res: NominatimResponse): string | null {
  if (res.name) return res.name;
  const a = res.address ?? {};
  const candidate =
    a.tourism ?? a.amenity ?? a.shop ?? a.leisure ?? a.building ??
    a.neighbourhood ?? a.suburb ?? a.village ?? a.town ?? a.city;
  if (candidate) return candidate;
  return res.display_name?.split(",")[0]?.trim() ?? null;
}

/** スポット名を取得。オフ設定・失敗時は null */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  if (!getSettings().reverseGeocode) return null;

  const key = cacheKey(lat, lng);
  const cached = readCache()[key];
  if (cached) return cached;

  try {
    const name = await throttled(async () => {
      const url =
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2` +
        `&lat=${lat}&lon=${lng}&zoom=18&accept-language=ja`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) return null;
      return pickName((await res.json()) as NominatimResponse);
    });
    if (name) {
      const cache = readCache();
      cache[key] = name;
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
      } catch {
        // 容量超過時はキャッシュを諦める(機能には影響しない)
      }
    }
    return name;
  } catch {
    return null;
  }
}
