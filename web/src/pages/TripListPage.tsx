import { useEffect, useState } from "react";
import { navigate } from "../app/router";
import { listTrips } from "../core/db";
import type { Trip } from "../core/types";
import { TripCard } from "./HomePage";

export function TripListPage() {
  const [trips, setTrips] = useState<Trip[] | null>(null);

  useEffect(() => {
    void listTrips().then((all) => setTrips(all.filter((t) => t.status === "done")));
  }, []);

  return (
    <>
      <header className="appbar">
        <button type="button" className="icon-btn" onClick={() => navigate("/")} aria-label="ホームへ戻る">
          ←
        </button>
        <h1>すべての旅</h1>
      </header>
      {trips === null ? null : trips.length === 0 ? (
        <p className="empty">まだ旅の記録がありません。</p>
      ) : (
        <div className="stack">
          {trips.map((t) => (
            <TripCard key={t.id} trip={t} />
          ))}
        </div>
      )}
    </>
  );
}
