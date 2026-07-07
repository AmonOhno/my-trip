import { describe, expect, it } from "vitest";
import { buildTimeline } from "./timeline";
import type { Spot, TrackPoint, Trip } from "./types";

const trip: Trip = {
  id: "t1",
  title: "テストの旅",
  note: "",
  startedAt: 0,
  endedAt: 100 * 60_000,
  distanceM: 5000,
  steps: null,
  status: "done",
};

function spot(id: string, arrivedMin: number, departedMin: number): Spot {
  return {
    id,
    tripId: "t1",
    lat: 35.319,
    lng: 139.5467,
    name: id,
    note: "",
    arrivedAt: arrivedMin * 60_000,
    departedAt: departedMin * 60_000,
    nameSource: "manual",
  };
}

// 十分な距離の移動を表す2点(約1.1km)
function movePoints(fromMin: number, toMin: number): TrackPoint[] {
  return [
    { tripId: "t1", lat: 35.319, lng: 139.5467, accuracyM: 10, timestamp: fromMin * 60_000 },
    { tripId: "t1", lat: 35.329, lng: 139.5467, accuracyM: 10, timestamp: toMin * 60_000 },
  ];
}

describe("buildTimeline", () => {
  it("移動→滞在→移動 の並びを導出する", () => {
    const spots = [spot("a", 20, 40), spot("b", 60, 80)];
    const points = [...movePoints(0, 20), ...movePoints(40, 60), ...movePoints(80, 100)];
    const segments = buildTimeline(trip, spots, points);
    expect(segments.map((s) => s.kind)).toEqual(["move", "stay", "move", "stay", "move"]);
  });

  it("微小な揺らぎ移動はノイズとして省く", () => {
    const spots = [spot("a", 0, 40), spot("b", 41, 80)];
    const segments = buildTimeline(trip, spots, []);
    // a退出(40分)→b到着(41分)の間は距離0・1分なので move は入らない
    expect(segments.filter((s) => s.kind === "stay")).toHaveLength(2);
    expect(segments.filter((s) => s.kind === "move" && s.fromMs === 40 * 60_000)).toHaveLength(0);
  });

  it("スポットゼロなら全体がひとつの移動になる", () => {
    const segments = buildTimeline(trip, [], movePoints(0, 100));
    expect(segments).toHaveLength(1);
    expect(segments[0].kind).toBe("move");
  });
});
