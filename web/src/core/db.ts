import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Spot, TrackPoint, Trip } from "./types";

interface MyTripDB extends DBSchema {
  trips: {
    key: string;
    value: Trip;
    indexes: { byStatus: string };
  };
  points: {
    key: number;
    value: TrackPoint;
    indexes: { byTrip: string };
  };
  spots: {
    key: string;
    value: Spot;
    indexes: { byTrip: string };
  };
}

let dbPromise: Promise<IDBPDatabase<MyTripDB>> | null = null;

function db(): Promise<IDBPDatabase<MyTripDB>> {
  dbPromise ??= openDB<MyTripDB>("my-trip", 1, {
    upgrade(d) {
      const trips = d.createObjectStore("trips", { keyPath: "id" });
      trips.createIndex("byStatus", "status");
      const points = d.createObjectStore("points", { autoIncrement: true });
      points.createIndex("byTrip", "tripId");
      const spots = d.createObjectStore("spots", { keyPath: "id" });
      spots.createIndex("byTrip", "tripId");
    },
  });
  return dbPromise;
}

export async function putTrip(trip: Trip): Promise<void> {
  await (await db()).put("trips", trip);
}

export async function getTrip(id: string): Promise<Trip | undefined> {
  return (await db()).get("trips", id);
}

export async function listTrips(): Promise<Trip[]> {
  const all = await (await db()).getAll("trips");
  return all.sort((a, b) => b.startedAt - a.startedAt);
}

export async function findRecordingTrip(): Promise<Trip | undefined> {
  const hits = await (await db()).getAllFromIndex("trips", "byStatus", "recording");
  return hits[0];
}

export async function addPoint(point: TrackPoint): Promise<void> {
  await (await db()).add("points", point);
}

export async function listPoints(tripId: string): Promise<TrackPoint[]> {
  const pts = await (await db()).getAllFromIndex("points", "byTrip", tripId);
  return pts.sort((a, b) => a.timestamp - b.timestamp);
}

export async function putSpot(spot: Spot): Promise<void> {
  await (await db()).put("spots", spot);
}

export async function getSpot(id: string): Promise<Spot | undefined> {
  return (await db()).get("spots", id);
}

export async function deleteSpot(id: string): Promise<void> {
  await (await db()).delete("spots", id);
}

export async function listSpots(tripId: string): Promise<Spot[]> {
  const spots = await (await db()).getAllFromIndex("spots", "byTrip", tripId);
  return spots.sort((a, b) => a.arrivedAt - b.arrivedAt);
}

export async function deleteTrip(id: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(["trips", "points", "spots"], "readwrite");
  await tx.objectStore("trips").delete(id);
  for (const store of ["points", "spots"] as const) {
    const index = tx.objectStore(store).index("byTrip");
    let cursor = await index.openCursor(id);
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
  }
  await tx.done;
}

export async function clearAll(): Promise<void> {
  const d = await db();
  const tx = d.transaction(["trips", "points", "spots"], "readwrite");
  await Promise.all([
    tx.objectStore("trips").clear(),
    tx.objectStore("points").clear(),
    tx.objectStore("spots").clear(),
  ]);
  await tx.done;
}
