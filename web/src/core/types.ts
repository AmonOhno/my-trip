export type TripStatus = "recording" | "done";

export interface Trip {
  id: string;
  title: string;
  note: string;
  startedAt: number;
  endedAt: number | null;
  distanceM: number;
  steps: number | null;
  status: TripStatus;
}

export interface TrackPoint {
  tripId: string;
  lat: number;
  lng: number;
  accuracyM: number;
  timestamp: number;
}

export type SpotNameSource = "geocode" | "manual" | "placeholder";

export interface Spot {
  id: string;
  tripId: string;
  lat: number;
  lng: number;
  name: string;
  note: string;
  arrivedAt: number;
  departedAt: number | null;
  nameSource: SpotNameSource;
}

/**
 * 旅の計画。ローカル保存のみで `my-trip-export/v1` スキーマには含めない
 * (docs/01_requirements.md §3.4)
 */
export interface TripPlan {
  id: string;
  title: string;
  note: string;
  /** 開始日(その日のローカル0時, epoch ms) */
  startDate: number;
  /** 終了日(その日のローカル0時, epoch ms)。startDate 以上 */
  endDate: number;
  createdAt: number;
  /** この計画から記録した旅のID。未実行は null */
  tripId: string | null;
}

/** 計画の「行きたい場所」1件 */
export interface PlanItem {
  id: string;
  planId: string;
  name: string;
  note: string;
  /** 一覧内の表示順 (0始まり) */
  order: number;
  /** 地図上の位置。未設定(名前だけの場所)は null */
  lat: number | null;
  lng: number | null;
}

/** 座標が入っている「行きたい場所」。地図描画はこの型だけを扱う */
export type LocatedPlanItem = PlanItem & { lat: number; lng: number };

/** タイムライン表示用(保存せず導出する) */
export type TimelineSegment =
  | { kind: "stay"; spot: Spot }
  | { kind: "move"; fromMs: number; toMs: number; distanceM: number };
