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

/** タイムライン表示用(保存せず導出する) */
export type TimelineSegment =
  | { kind: "stay"; spot: Spot }
  | { kind: "move"; fromMs: number; toMs: number; distanceM: number };
