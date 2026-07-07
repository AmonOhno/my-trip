import { useEffect, useRef, useState } from "react";
import { MapView } from "../components/MapView";
import { navigate } from "../app/router";
import { useRecorder } from "../app/useRecorder";
import { listPoints } from "../core/db";
import { formatClock, formatDistance, formatElapsed } from "../core/format";
import { recorder } from "../core/recorder";
import type { TrackPoint } from "../core/types";

function useElapsed(startedAt: number | null): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  return startedAt === null ? "00:00:00" : formatElapsed(now - startedAt);
}

export function RecordingPage() {
  const rec = useRecorder();
  const elapsed = useElapsed(rec.trip?.startedAt ?? null);
  const [points, setPoints] = useState<TrackPoint[]>([]);
  const [stopping, setStopping] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const tripId = rec.trip?.id ?? null;
  const lastPointTs = rec.lastPoint?.timestamp ?? 0;

  useEffect(() => {
    if (!tripId) return;
    void listPoints(tripId).then(setPoints);
  }, [tripId, lastPointTs]);

  useEffect(() => {
    if (rec.status === "idle" && !stopping) navigate("/");
  }, [rec.status, stopping]);

  const onStop = async () => {
    dialogRef.current?.close();
    setStopping(true);
    const trip = await recorder.stop();
    navigate(trip ? `/trips/${trip.id}` : "/");
  };

  if (!rec.trip) return null;

  return (
    <>
      <header className="appbar">
        <span className="rec-badge">記録中</span>
        <div className="spacer" />
        <span className="elapsed" aria-label="経過時間">{elapsed}</span>
      </header>

      <div className="stack">
        <MapView points={points} spots={rec.spots} follow={rec.lastPoint} />

        <div className="stat-row" aria-live="polite">
          <div className="stat-tile">
            <span className="value">{formatDistance(rec.distanceM)}</span>
            <span className="label">移動距離</span>
          </div>
          <div className="stat-tile">
            <span className="value">{rec.spots.length}</span>
            <span className="label">スポット</span>
          </div>
        </div>

        {rec.errorMessage ? <p className="error-box" role="alert">{rec.errorMessage}</p> : null}

        <h2 className="section-title">立ち寄ったスポット</h2>
        {rec.spots.length === 0 ? (
          <p className="muted">まだスポットはありません。同じ場所に10分ほど滞在すると自動で記録されます。</p>
        ) : (
          <ul className="timeline">
            {rec.spots.map((s) => (
              <li key={s.id} className="stay">
                <span className="stay-name">{s.name}</span>
                <br />
                <span className="muted">
                  {formatClock(s.arrivedAt)} –{s.departedAt !== null ? ` ${formatClock(s.departedAt)}` : " 滞在中"}
                </span>
              </li>
            ))}
          </ul>
        )}

        <p className="notice">
          Web版はこのタブを開いている間だけ記録できます。画面を閉じる場合はiOSアプリをご利用ください。
        </p>

        <button type="button" className="btn-danger" onClick={() => dialogRef.current?.showModal()}>
          ■ 旅を終了する
        </button>
      </div>

      <dialog ref={dialogRef} aria-labelledby="stop-title">
        <div className="stack">
          <h2 id="stop-title" style={{ fontSize: 17 }}>旅を終了しますか?</h2>
          <p className="muted">記録が確定し、旅一覧に保存されます。</p>
          <div className="row">
            <button type="button" onClick={() => dialogRef.current?.close()}>
              続ける
            </button>
            <div className="spacer" />
            <button type="button" className="btn-danger" onClick={onStop} disabled={stopping}>
              終了する
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
