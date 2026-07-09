import { describe, expect, it } from "vitest";
import {
  MIN_POINT_GAP_MS,
  shouldSavePoint,
  VEHICLE_MIN_POINT_GAP_MS,
  type SamplePoint,
} from "./sampling";

/** 緯度方向に約 meters メートル移動した点を作る(1度 ≈ 111,320m) */
function moved(base: SamplePoint, meters: number, dtMs: number): SamplePoint {
  return {
    lat: base.lat + meters / 111_320,
    lng: base.lng,
    timestamp: base.timestamp + dtMs,
  };
}

const origin: SamplePoint = { lat: 35.0, lng: 135.0, timestamp: 1_000_000 };

describe("shouldSavePoint", () => {
  it("最初のポイント(前回保存なし)は保存する", () => {
    expect(shouldSavePoint(null, origin)).toBe(true);
  });

  it("徒歩: 10m未満かつ15秒未満はスキップする", () => {
    expect(shouldSavePoint(origin, moved(origin, 5, 10_000))).toBe(false);
  });

  it("徒歩: 10m以上動いたら保存する", () => {
    expect(shouldSavePoint(origin, moved(origin, 12, 8_000))).toBe(true);
  });

  it("滞在中: 動かなくても15秒経過で保存する", () => {
    expect(shouldSavePoint(origin, moved(origin, 2, MIN_POINT_GAP_MS))).toBe(true);
  });

  it("乗り物(電車相当 25m/s): 30秒未満は距離が大きくてもスキップする", () => {
    // 25m/s × 10秒 = 250m 移動。従来は保存されていたが、乗り物中は書き込みを抑える
    expect(shouldSavePoint(origin, moved(origin, 250, 10_000))).toBe(false);
  });

  it("乗り物: 30秒経過したら保存する", () => {
    expect(shouldSavePoint(origin, moved(origin, 750, VEHICLE_MIN_POINT_GAP_MS))).toBe(true);
  });

  it("乗り物の境界: 8m/s を少しでも超えると乗り物扱いでスキップする", () => {
    // 座標→距離の換算誤差があるため、境界ちょうどではなくわずかに上で検証する
    expect(shouldSavePoint(origin, moved(origin, 82, 10_000))).toBe(false);
  });

  it("徒歩の境界: 8m/s 未満なら従来どおり10mで保存する", () => {
    expect(shouldSavePoint(origin, moved(origin, 79, 10_000))).toBe(true);
  });

  it("同時刻の重複ポイントはスキップする", () => {
    expect(shouldSavePoint(origin, moved(origin, 50, 0))).toBe(false);
  });
});
