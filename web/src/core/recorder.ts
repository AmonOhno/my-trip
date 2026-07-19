import * as db from "./db";
import { distanceM } from "./geo";
import { reverseGeocode } from "./geocode";
import { StayPointDetector, type StayEvent } from "./stayPoint";
import type { Spot, TrackPoint, Trip } from "./types";

/** 保存する軌跡ポイントの間引き条件 */
const MIN_POINT_GAP_M = 10;
const MIN_POINT_GAP_MS = 15_000;
/** これより精度が悪いポイントは無視する */
const MAX_ACCURACY_M = 80;

export type RecorderStatus = "idle" | "starting" | "recording" | "error";

export interface RecorderState {
  status: RecorderStatus;
  trip: Trip | null;
  spots: Spot[];
  distanceM: number;
  lastPoint: TrackPoint | null;
  /** 位置情報が取得できないときのユーザー向けメッセージ */
  errorMessage: string | null;
}

const IDLE: RecorderState = {
  status: "idle",
  trip: null,
  spots: [],
  distanceM: 0,
  lastPoint: null,
  errorMessage: null,
};

type Listener = () => void;

/**
 * 記録セッションの状態機械(モジュールシングルトン)。
 * useSyncExternalStore から購読する。
 */
class TripRecorder {
  private state: RecorderState = IDLE;
  private listeners = new Set<Listener>();
  private watchId: number | null = null;
  private detector = new StayPointDetector();
  private lastSavedPoint: TrackPoint | null = null;
  private currentSpotId: string | null = null;
  private lastConfirmedSpotId: string | null = null;
  private spotSeq = 0;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): RecorderState => this.state;

  /** 起動時に呼ぶ。中断された記録セッションがあれば復元する */
  async restore(): Promise<void> {
    if (this.state.status !== "idle") return;
    const trip = await db.findRecordingTrip();
    if (!trip) return;

    const [points, spots] = await Promise.all([
      db.listPoints(trip.id),
      db.listSpots(trip.id),
    ]);
    // 検出器へ全ポイントを再投入して内部状態を復元する。
    // 検出は決定的なので、既存スポットは arrivedAt で照合して二重作成を防ぐ。
    this.detector.reset();
    const existingByArrival = new Map(spots.map((s) => [s.arrivedAt, s]));
    this.spotSeq = spots.length;
    for (const p of points) {
      const event = this.detector.addPoint(p);
      if (event) this.applyStayEventOnRestore(event, trip.id, existingByArrival);
    }
    this.lastSavedPoint = points[points.length - 1] ?? null;

    this.setState({
      status: "recording",
      trip,
      spots: await db.listSpots(trip.id),
      distanceM: trip.distanceM,
      lastPoint: this.lastSavedPoint,
      errorMessage: null,
    });
    this.startWatching();
  }

  /** 記録を開始する。計画から開始する場合はタイトルを引き継ぐ */
  async start(options?: { title?: string }): Promise<Trip | null> {
    if (this.state.status === "recording" || this.state.status === "starting") return null;
    if (!("geolocation" in navigator)) {
      this.setState({ ...IDLE, status: "error", errorMessage: "この端末では位置情報が利用できません。" });
      return null;
    }
    const now = Date.now();
    const trip: Trip = {
      id: crypto.randomUUID(),
      title: options?.title?.trim() || `${new Date(now).toLocaleDateString("ja-JP")} の旅`,
      note: "",
      startedAt: now,
      endedAt: null,
      distanceM: 0,
      steps: null,
      status: "recording",
    };
    this.detector.reset();
    this.lastSavedPoint = null;
    this.currentSpotId = null;
    this.lastConfirmedSpotId = null;
    this.spotSeq = 0;
    await db.putTrip(trip);
    this.setState({ ...IDLE, status: "recording", trip });
    this.startWatching();
    return trip;
  }

  async stop(): Promise<Trip | null> {
    const trip = this.state.trip;
    if (!trip) return null;
    this.stopWatching();

    const endedAt = Date.now();
    const finalEvent = this.detector.finish(endedAt);
    if (finalEvent) await this.applyStayEvent(finalEvent, trip.id);

    const done: Trip = { ...trip, endedAt, distanceM: this.state.distanceM, status: "done" };
    await db.putTrip(done);
    this.setState(IDLE);
    return done;
  }

  private startWatching(): void {
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => void this.onPosition(pos),
      (err) => {
        const message =
          err.code === err.PERMISSION_DENIED
            ? "位置情報の利用が許可されていません。ブラウザの設定から許可してください。"
            : "位置情報を取得できません。屋外など電波の良い場所でお試しください。";
        this.setState({ ...this.state, errorMessage: message });
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 },
    );
  }

  private stopWatching(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  private async onPosition(pos: GeolocationPosition): Promise<void> {
    const trip = this.state.trip;
    if (!trip || this.state.status !== "recording") return;
    if (pos.coords.accuracy > MAX_ACCURACY_M) return;

    const point: TrackPoint = {
      tripId: trip.id,
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracyM: pos.coords.accuracy,
      timestamp: pos.timestamp,
    };

    const prev = this.lastSavedPoint;
    if (
      prev &&
      distanceM(prev, point) < MIN_POINT_GAP_M &&
      point.timestamp - prev.timestamp < MIN_POINT_GAP_MS
    ) {
      return;
    }

    let total = this.state.distanceM;
    if (prev) total += distanceM(prev, point);
    this.lastSavedPoint = point;
    await db.addPoint(point);

    const event = this.detector.addPoint(point);
    if (event) await this.applyStayEvent(event, trip.id);

    const updatedTrip: Trip = { ...trip, distanceM: total };
    await db.putTrip(updatedTrip);
    this.setState({
      ...this.state,
      trip: updatedTrip,
      distanceM: total,
      lastPoint: point,
      errorMessage: null,
    });
  }

  private async applyStayEvent(event: StayEvent, tripId: string): Promise<void> {
    if (event.isUpdate && this.currentSpotId) {
      const spot = await db.getSpot(this.currentSpotId);
      if (spot) {
        const updated: Spot = { ...spot, lat: event.lat, lng: event.lng, departedAt: event.departedAt };
        await db.putSpot(updated);
        if (event.departedAt !== null) {
          this.lastConfirmedSpotId = this.currentSpotId;
          this.currentSpotId = null;
        }
      }
    } else if (!event.isUpdate) {
      // 直前の確定スポットのすぐ近くなら結合(GPS揺らぎで一瞬離れたケース)
      if (this.lastConfirmedSpotId && this.detector.shouldMergeWithLast(event.lat, event.lng)) {
        const last = await db.getSpot(this.lastConfirmedSpotId);
        if (last) {
          await db.putSpot({ ...last, departedAt: event.departedAt });
          this.currentSpotId = last.id;
          this.lastConfirmedSpotId = null;
        }
      } else {
        await this.createSpot(event, tripId);
      }
    }
    this.setState({ ...this.state, spots: await db.listSpots(tripId) });
  }

  private async createSpot(event: StayEvent, tripId: string): Promise<void> {
    this.spotSeq += 1;
    const spot: Spot = {
      id: crypto.randomUUID(),
      tripId,
      lat: event.lat,
      lng: event.lng,
      name: `スポット ${this.spotSeq}`,
      note: "",
      arrivedAt: event.arrivedAt,
      departedAt: event.departedAt,
      nameSource: "placeholder",
    };
    await db.putSpot(spot);
    this.currentSpotId = spot.id;
    // 名前は非同期で後付け。失敗しても記録は成立する
    void reverseGeocode(event.lat, event.lng).then(async (name) => {
      if (!name) return;
      const current = await db.getSpot(spot.id);
      if (current && current.nameSource === "placeholder") {
        await db.putSpot({ ...current, name, nameSource: "geocode" });
        if (this.state.trip?.id === tripId) {
          this.setState({ ...this.state, spots: await db.listSpots(tripId) });
        }
      }
    });
  }

  /** 復元時: 再検出したイベントを既存スポットへ紐付ける */
  private applyStayEventOnRestore(
    event: StayEvent,
    tripId: string,
    existing: Map<number, Spot>,
  ): void {
    const match = existing.get(event.arrivedAt);
    if (match) {
      if (event.departedAt !== null) {
        this.lastConfirmedSpotId = match.id;
        this.currentSpotId = null;
      } else {
        this.currentSpotId = match.id;
      }
      return;
    }
    // 既存に無い(中断中に確定しそこねた)イベントは新規作成
    void this.applyStayEvent(event, tripId);
  }

  private setState(next: RecorderState): void {
    this.state = next;
    for (const l of this.listeners) l();
  }
}

export const recorder = new TripRecorder();
