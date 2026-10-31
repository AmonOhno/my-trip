import { test as base, expect } from "@playwright/test";

/** 鎌倉駅付近。位置情報のモック座標 */
export const KAMAKURA = { latitude: 35.3192, longitude: 139.5503 };

// 1x1 透明 PNG(地図タイルの代わり)
const TILE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

/**
 * 全テスト共通のフィクスチャ。
 * - 位置情報: 許可済み + 固定座標
 * - 外部通信: OSMタイルとNominatimはモック応答、それ以外の外部ホストは遮断
 *   (ローカルファースト・コスト0円制約の確認も兼ねる)
 */
export const test = base.extend({
  context: async ({ context }, use) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ ...KAMAKURA, accuracy: 10 });

    await context.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === "tile.openstreetmap.org") {
        return route.fulfill({ status: 200, contentType: "image/png", body: TILE_PNG });
      }
      if (url.hostname === "nominatim.openstreetmap.org") {
        if (url.pathname === "/search") {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            json: [
              {
                place_id: 1001,
                lat: "35.3258",
                lon: "139.5564",
                name: "鶴岡八幡宮",
                display_name: "鶴岡八幡宮, 雪ノ下, 鎌倉市, 神奈川県, 日本",
              },
            ],
          });
        }
        if (url.pathname === "/reverse") {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            json: { name: "鎌倉駅", display_name: "鎌倉駅, 小町, 鎌倉市, 神奈川県, 日本" },
          });
        }
      }
      return route.abort("blockedbyclient");
    });

    await use(context);
  },
});

export { expect };
