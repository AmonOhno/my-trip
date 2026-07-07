import * as db from "./db";
import type { Spot, TrackPoint, Trip } from "./types";

/** Web⇔iOS 共通のエクスポート形式 */
export interface ExportFile {
  format: "my-trip-export/v1";
  exportedAt: number;
  trips: Trip[];
  points: TrackPoint[];
  spots: Spot[];
}

export async function exportAll(): Promise<ExportFile> {
  const trips = await db.listTrips();
  const points: TrackPoint[] = [];
  const spots: Spot[] = [];
  for (const trip of trips) {
    points.push(...(await db.listPoints(trip.id)));
    spots.push(...(await db.listSpots(trip.id)));
  }
  return { format: "my-trip-export/v1", exportedAt: Date.now(), trips, points, spots };
}

export function downloadExport(data: ExportFile): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `my-trip-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** インポート。既存と同じ trip id は上書きする。取り込んだ旅の数を返す */
export async function importAll(json: string): Promise<number> {
  const data = JSON.parse(json) as Partial<ExportFile>;
  if (data.format !== "my-trip-export/v1" || !Array.isArray(data.trips)) {
    throw new Error("対応していないファイル形式です。");
  }
  for (const trip of data.trips) {
    // 同一idの旅は総入れ替え(ポイント二重登録を防ぐ)
    await db.deleteTrip(trip.id);
    // 記録中のままエクスポートされた旅は完了扱いで取り込む
    await db.putTrip(trip.status === "recording" ? { ...trip, status: "done", endedAt: trip.endedAt ?? trip.startedAt } : trip);
  }
  for (const p of data.points ?? []) await db.addPoint(p);
  for (const s of data.spots ?? []) await db.putSpot(s);
  return data.trips.length;
}
