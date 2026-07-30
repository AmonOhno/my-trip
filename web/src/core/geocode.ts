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

/** 地名検索の1件 */
export interface PlaceSearchResult {
  id: string;
  /** 施設名など短い名前 */
  name: string;
  /** 補足に出す住所文字列 */
  address: string;
  lat: number;
  lng: number;
}

interface NominatimSearchItem extends NominatimResponse {
  place_id?: number;
  lat?: string;
  lon?: string;
}

/** 同じ語の再検索でリクエストを増やさないためのセッション内キャッシュ */
const searchCache = new Map<string, PlaceSearchResult[]>();

/**
 * 地名検索 (Nominatim `/search`)。逆ジオコーディングと同じキューを共有するので、
 * 両方を使っても外向きのリクエストは1秒に1回以下に保たれる。
 * 失敗時は空配列(呼び出し側は手入力で続行できる)。
 */
export async function searchPlaces(query: string, limit = 5): Promise<PlaceSearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  const cached = searchCache.get(q);
  if (cached) return cached;

  try {
    const results = await throttled(async () => {
      const url =
        `https://nominatim.openstreetmap.org/search?format=jsonv2` +
        `&q=${encodeURIComponent(q)}&limit=${limit}&accept-language=ja`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) return [];
      const items = (await res.json()) as NominatimSearchItem[];
      return items.flatMap((item, i): PlaceSearchResult[] => {
        const lat = Number(item.lat);
        const lng = Number(item.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
        return [{
          id: String(item.place_id ?? `${i}-${lat},${lng}`),
          name: pickName(item) ?? q,
          address: item.display_name ?? "",
          lat,
          lng,
        }];
      });
    });
    searchCache.set(q, results);
    return results;
  } catch {
    return [];
  }
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
