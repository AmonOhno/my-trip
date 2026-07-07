import { centroid, distanceM, type LatLng } from "./geo";

export const STAY_RADIUS_M = 80;
export const STAY_MIN_DURATION_MS = 10 * 60 * 1000;
export const MERGE_GAP_M = 120;

export interface StayEvent {
  lat: number;
  lng: number;
  arrivedAt: number;
  /** null = まだ滞在継続中(暫定スポット) */
  departedAt: number | null;
  /** 直前に発火した暫定スポットの更新なら true(新規作成ではなく上書き) */
  isUpdate: boolean;
}

interface InputPoint extends LatLng {
  timestamp: number;
}

/**
 * ストリーミング滞在検出。
 * addPoint() にポイントを流し込むと、滞在確定/更新のたびに StayEvent を返す。
 * アルゴリズム詳細は docs/02_architecture.md §2。iOS版 StayPointDetector.swift と同一ロジック。
 */
export class StayPointDetector {
  private anchor: InputPoint | null = null;
  private cluster: InputPoint[] = [];
  private emitted = false;
  private lastStay: { lat: number; lng: number } | null = null;

  addPoint(p: InputPoint): StayEvent | null {
    if (this.anchor === null) {
      this.startCluster(p);
      return null;
    }

    if (distanceM(this.anchor, p) <= STAY_RADIUS_M) {
      this.cluster.push(p);
      const duration = p.timestamp - this.cluster[0].timestamp;
      if (duration >= STAY_MIN_DURATION_MS) {
        // 滞在継続中: 初回は暫定スポット発火、以降は重心と滞在時間を更新
        const isUpdate = this.emitted;
        this.emitted = true;
        return this.buildEvent(null, isUpdate);
      }
      return null;
    }

    // 半径から出た
    if (this.emitted) {
      const event = this.buildEvent(this.cluster[this.cluster.length - 1].timestamp, true);
      this.lastStay = { lat: event.lat, lng: event.lng };
      this.startCluster(p);
      return event;
    }
    this.startCluster(p);
    return null;
  }

  /** 旅終了時に呼ぶ。滞在継続中なら最終確定イベントを返す */
  finish(endedAt: number): StayEvent | null {
    if (this.anchor === null || !this.emitted) return null;
    const event = this.buildEvent(endedAt, true);
    this.reset();
    return event;
  }

  /** 直前の確定スポットと近すぎる場合の結合判定(GPS揺らぎ対策) */
  shouldMergeWithLast(lat: number, lng: number): boolean {
    return (
      this.lastStay !== null &&
      distanceM(this.lastStay, { lat, lng }) <= MERGE_GAP_M
    );
  }

  reset(): void {
    this.anchor = null;
    this.cluster = [];
    this.emitted = false;
    this.lastStay = null;
  }

  private startCluster(p: InputPoint): void {
    this.anchor = p;
    this.cluster = [p];
    this.emitted = false;
  }

  private buildEvent(departedAt: number | null, isUpdate: boolean): StayEvent {
    const c = centroid(this.cluster);
    return {
      lat: c.lat,
      lng: c.lng,
      arrivedAt: this.cluster[0].timestamp,
      departedAt,
      isUpdate,
    };
  }
}
