import { distanceM, type LatLng } from "./geo";

/** 保存する軌跡ポイントの間引き条件(iOS版 TripRecorder.swift と共通) */
export const MIN_POINT_GAP_M = 10;
export const MIN_POINT_GAP_MS = 15_000;
/** これ以上の推定速度は乗り物(電車・車・飛行機など)での移動とみなす */
export const VEHICLE_SPEED_MPS = 8;
/** 乗り物移動中の保存間隔。書き込み頻度を下げて発熱・電池消費を抑える (#9) */
export const VEHICLE_MIN_POINT_GAP_MS = 30_000;

export interface SamplePoint extends LatLng {
  timestamp: number;
}

/**
 * 新しいポイントを保存すべきか判定する。
 * - 徒歩相当: 前回保存点から10m以上 または 15秒以上で保存
 * - 乗り物相当(推定速度 8m/s 以上): 30秒間隔でのみ保存
 * 判定は保存済みポイントのみから決まるため、復元(F-06)の決定性を壊さない。
 */
export function shouldSavePoint(prev: SamplePoint | null, next: SamplePoint): boolean {
  if (!prev) return true;
  const dist = distanceM(prev, next);
  const dtMs = next.timestamp - prev.timestamp;
  const speedMps = dtMs > 0 ? dist / (dtMs / 1000) : Infinity;
  if (speedMps >= VEHICLE_SPEED_MPS) {
    return dtMs >= VEHICLE_MIN_POINT_GAP_MS;
  }
  return dist >= MIN_POINT_GAP_M || dtMs >= MIN_POINT_GAP_MS;
}
