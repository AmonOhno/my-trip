import { describe, expect, it } from "vitest";
import { distanceM } from "./geo";
import { StayPointDetector, STAY_MIN_DURATION_MS } from "./stayPoint";

// 鎌倉駅付近を基準に、メートル指定でポイントを作るヘルパー
const BASE = { lat: 35.319, lng: 139.5467 };
const M_PER_DEG_LAT = 111_320;

function pt(eastM: number, northM: number, atMin: number) {
  return {
    lat: BASE.lat + northM / M_PER_DEG_LAT,
    lng: BASE.lng + eastM / (M_PER_DEG_LAT * Math.cos((BASE.lat * Math.PI) / 180)),
    timestamp: atMin * 60_000,
  };
}

describe("distanceM", () => {
  it("メートル指定の座標変換が概ね正しい", () => {
    expect(distanceM(pt(0, 0, 0), pt(100, 0, 0))).toBeGreaterThan(95);
    expect(distanceM(pt(0, 0, 0), pt(100, 0, 0))).toBeLessThan(105);
  });
});

describe("StayPointDetector", () => {
  it("80m以内に10分とどまると暫定スポットが発火する", () => {
    const d = new StayPointDetector();
    expect(d.addPoint(pt(0, 0, 0))).toBeNull();
    expect(d.addPoint(pt(20, 10, 5))).toBeNull();
    const event = d.addPoint(pt(10, -10, 11));
    expect(event).not.toBeNull();
    expect(event!.isUpdate).toBe(false);
    expect(event!.departedAt).toBeNull();
  });

  it("短時間の通過ではスポットにならない", () => {
    const d = new StayPointDetector();
    expect(d.addPoint(pt(0, 0, 0))).toBeNull();
    expect(d.addPoint(pt(50, 0, 3))).toBeNull();
    expect(d.addPoint(pt(300, 0, 6))).toBeNull(); // 半径外へ、未発火のまま
    expect(d.addPoint(pt(600, 0, 9))).toBeNull();
  });

  it("半径を出ると確定イベント(departedAt付き)が返る", () => {
    const d = new StayPointDetector();
    d.addPoint(pt(0, 0, 0));
    d.addPoint(pt(10, 0, 12)); // 暫定発火
    const confirmed = d.addPoint(pt(500, 0, 20)); // 退出
    expect(confirmed).not.toBeNull();
    expect(confirmed!.isUpdate).toBe(true);
    expect(confirmed!.departedAt).toBe(12 * 60_000);
  });

  it("スポット座標は滞在中ポイントの重心になる", () => {
    const d = new StayPointDetector();
    d.addPoint(pt(0, 0, 0));
    const event = d.addPoint(pt(60, 0, 11))!;
    const c = pt(30, 0, 0);
    expect(distanceM(event, c)).toBeLessThan(1);
  });

  it("finish() で滞在継続中のスポットが確定する", () => {
    const d = new StayPointDetector();
    d.addPoint(pt(0, 0, 0));
    d.addPoint(pt(10, 0, 15));
    const event = d.finish(20 * 60_000);
    expect(event).not.toBeNull();
    expect(event!.departedAt).toBe(20 * 60_000);
  });

  it("未発火のまま finish() しても何も返らない", () => {
    const d = new StayPointDetector();
    d.addPoint(pt(0, 0, 0));
    d.addPoint(pt(10, 0, 2));
    expect(d.finish(3 * 60_000)).toBeNull();
  });

  it("確定直後の近接スポットは結合対象と判定される", () => {
    const d = new StayPointDetector();
    d.addPoint(pt(0, 0, 0));
    d.addPoint(pt(0, 0, 12));
    const confirmed = d.addPoint(pt(200, 0, 15))!;
    expect(confirmed.departedAt).not.toBeNull();
    expect(d.shouldMergeWithLast(confirmed.lat, confirmed.lng)).toBe(true);
    expect(d.shouldMergeWithLast(BASE.lat + 0.01, BASE.lng)).toBe(false);
  });

  it("滞在時間の閾値は定数と一致する", () => {
    expect(STAY_MIN_DURATION_MS).toBe(600_000);
  });
});
