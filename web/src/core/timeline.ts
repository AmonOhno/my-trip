import { pathDistanceM } from "./geo";
import type { Spot, TimelineSegment, TrackPoint, Trip } from "./types";

/**
 * スポット列と軌跡から「滞在 → 移動 → 滞在…」のタイムラインを導出する。
 * 移動セグメントは保存せず表示時に計算する(docs/02_architecture.md §4)。
 */
export function buildTimeline(
  trip: Trip,
  spots: readonly Spot[],
  points: readonly TrackPoint[],
): TimelineSegment[] {
  const segments: TimelineSegment[] = [];
  let cursorMs = trip.startedAt;

  for (const spot of spots) {
    if (spot.arrivedAt > cursorMs) {
      const move = buildMove(cursorMs, spot.arrivedAt, points);
      if (move) segments.push(move);
    }
    segments.push({ kind: "stay", spot });
    cursorMs = spot.departedAt ?? spot.arrivedAt;
  }

  const endMs = trip.endedAt ?? Date.now();
  if (endMs > cursorMs) {
    const move = buildMove(cursorMs, endMs, points);
    if (move) segments.push(move);
  }
  return segments;
}

function buildMove(
  fromMs: number,
  toMs: number,
  points: readonly TrackPoint[],
): TimelineSegment | null {
  const slice = points.filter((p) => p.timestamp >= fromMs && p.timestamp <= toMs);
  const dist = pathDistanceM(slice);
  // 数十mの揺らぎだけの「移動」はノイズなので表示しない
  if (dist < 100 && toMs - fromMs < 3 * 60_000) return null;
  return { kind: "move", fromMs, toMs, distanceM: dist };
}
