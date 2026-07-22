import { useEffect, useState } from "react";
import { navigate } from "../app/router";
import { useRecorder } from "../app/useRecorder";
import { listPlans, listTrips } from "../core/db";
import { formatDate, formatDistance, formatDuration } from "../core/format";
import { activePlans } from "../core/plan";
import { recorder } from "../core/recorder";
import type { Trip, TripPlan } from "../core/types";
import { PlanCard } from "./PlanListPage";

export function HomePage() {
  const rec = useRecorder();
  const [recent, setRecent] = useState<Trip[]>([]);
  const [plans, setPlans] = useState<TripPlan[]>([]);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    void listTrips().then((trips) => setRecent(trips.filter((t) => t.status === "done").slice(0, 3)));
    void listPlans().then((all) => setPlans(activePlans(all, Date.now()).slice(0, 2)));
  }, [rec.status]);

  const isRecording = rec.status === "recording";

  const onStart = async () => {
    if (isRecording) {
      navigate("/recording");
      return;
    }
    setStarting(true);
    await recorder.start();
    setStarting(false);
    navigate("/recording");
  };

  return (
    <>
      <header className="appbar">
        <h1>
          <span className="brand">My Trip</span> 旅の自動記録
        </h1>
        <button type="button" className="icon-btn" onClick={() => navigate("/settings")} aria-label="設定">
          設定
        </button>
      </header>

      <div className="stack">
        <button type="button" className="btn-primary btn-start" onClick={onStart} disabled={starting}>
          {isRecording ? "● 記録中の旅を再開する" : starting ? "開始しています…" : "旅をはじめる"}
        </button>
        <p className="muted">
          「旅をはじめる」を押すと、訪れたスポットと移動の足取りを自動で記録します。記録中の操作は不要です。
        </p>
        {rec.errorMessage ? <p className="error-box" role="alert">{rec.errorMessage}</p> : null}

        <h2 className="section-title">旅の計画</h2>
        {plans.length === 0 ? (
          <p className="muted">次の旅の計画をたてて、行きたい場所をメモしておけます。</p>
        ) : (
          <div className="stack">
            {plans.map((p) => (
              <PlanCard key={p.id} plan={p} />
            ))}
          </div>
        )}
        <a href="#/plans">{plans.length === 0 ? "計画をたてる →" : "すべての計画を見る →"}</a>

        <h2 className="section-title">最近の旅</h2>
        {recent.length === 0 ? (
          <p className="empty">まだ旅の記録がありません。最初の旅に出かけましょう。</p>
        ) : (
          <div className="stack">
            {recent.map((t) => (
              <TripCard key={t.id} trip={t} />
            ))}
            <a href="#/trips">すべての旅を見る →</a>
          </div>
        )}
      </div>
    </>
  );
}

export function TripCard({ trip }: { trip: Trip }) {
  const duration = trip.endedAt !== null ? trip.endedAt - trip.startedAt : 0;
  return (
    <a className="trip-card" href={`#/trips/${trip.id}`}>
      <h3>{trip.title}</h3>
      <span className="muted">
        {formatDate(trip.startedAt)}・{formatDistance(trip.distanceM)}・{formatDuration(duration)}
      </span>
    </a>
  );
}
