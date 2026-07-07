import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { navigate } from "../app/router";
import { MapView } from "../components/MapView";
import { Timeline } from "../components/Timeline";
import * as db from "../core/db";
import { formatDate, formatDistance, formatDuration } from "../core/format";
import { buildTimeline } from "../core/timeline";
import type { Spot, TrackPoint, Trip } from "../core/types";

export function TripDetailPage({ tripId }: { tripId: string }) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [points, setPoints] = useState<TrackPoint[]>([]);
  const [spots, setSpots] = useState<Spot[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [focusSpotId, setFocusSpotId] = useState<string | null>(null);
  const [editingSpot, setEditingSpot] = useState<Spot | null>(null);
  const [editingTrip, setEditingTrip] = useState(false);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const t = await db.getTrip(tripId);
      if (cancelled) return;
      if (!t) {
        setNotFound(true);
        return;
      }
      const [pts, sps] = await Promise.all([db.listPoints(tripId), db.listSpots(tripId)]);
      if (cancelled) return;
      setTrip(t);
      setPoints(pts);
      setSpots(sps);
    })();
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  const segments = useMemo(
    () => (trip ? buildTimeline(trip, spots, points) : []),
    [trip, spots, points],
  );

  const reloadSpots = useCallback(async () => {
    setSpots(await db.listSpots(tripId));
  }, [tripId]);

  const onDeleteTrip = async () => {
    deleteDialogRef.current?.close();
    await db.deleteTrip(tripId);
    navigate("/trips");
  };

  if (notFound) {
    return (
      <p className="empty">
        この旅は見つかりませんでした。<a href="#/trips">旅一覧へ</a>
      </p>
    );
  }
  if (!trip) return null;

  const duration = (trip.endedAt ?? Date.now()) - trip.startedAt;

  return (
    <>
      <header className="appbar">
        <button type="button" className="icon-btn" onClick={() => navigate("/trips")} aria-label="旅一覧へ戻る">
          ←
        </button>
        <h1 style={{ fontSize: 18 }}>{trip.title}</h1>
        <button type="button" className="icon-btn" onClick={() => setEditingTrip(true)}>
          編集
        </button>
      </header>

      <div className="stack">
        <span className="muted">{formatDate(trip.startedAt)}</span>
        <MapView points={points} spots={spots} focusSpotId={focusSpotId} />

        <div className="stat-row">
          <div className="stat-tile">
            <span className="value">{formatDistance(trip.distanceM)}</span>
            <span className="label">移動距離</span>
          </div>
          <div className="stat-tile">
            <span className="value">{formatDuration(duration)}</span>
            <span className="label">所要時間</span>
          </div>
          <div className="stat-tile">
            <span className="value">{spots.length}</span>
            <span className="label">スポット</span>
          </div>
          {trip.steps !== null ? (
            <div className="stat-tile">
              <span className="value">{trip.steps.toLocaleString("ja-JP")}</span>
              <span className="label">歩数</span>
            </div>
          ) : null}
        </div>

        {trip.note ? <p>{trip.note}</p> : null}

        <h2 className="section-title">タイムライン</h2>
        <Timeline segments={segments} onSelectSpot={setFocusSpotId} />

        <h2 className="section-title">スポットの編集</h2>
        <div className="stack">
          {spots.map((s, i) => (
            <button key={s.id} type="button" className="trip-card" onClick={() => setEditingSpot(s)}>
              <h3>
                {i + 1}. {s.name}
              </h3>
              <span className="muted">{s.note || "タップして名前・メモを編集"}</span>
            </button>
          ))}
        </div>

        <button type="button" className="btn-danger" onClick={() => deleteDialogRef.current?.showModal()}>
          この旅を削除する
        </button>
      </div>

      {editingSpot ? (
        <SpotEditDialog
          spot={editingSpot}
          onClose={() => setEditingSpot(null)}
          onSaved={reloadSpots}
        />
      ) : null}

      {editingTrip ? (
        <TripEditDialog
          trip={trip}
          onClose={() => setEditingTrip(false)}
          onSaved={async () => setTrip((await db.getTrip(tripId)) ?? null)}
        />
      ) : null}

      <dialog ref={deleteDialogRef} aria-labelledby="del-title">
        <div className="stack">
          <h2 id="del-title" style={{ fontSize: 17 }}>この旅を削除しますか?</h2>
          <p className="muted">軌跡・スポットを含むすべての記録が削除されます。元に戻せません。</p>
          <div className="row">
            <button type="button" onClick={() => deleteDialogRef.current?.close()}>
              キャンセル
            </button>
            <div className="spacer" />
            <button type="button" className="btn-danger" onClick={onDeleteTrip}>
              削除する
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

function SpotEditDialog({
  spot,
  onClose,
  onSaved,
}: {
  spot: Spot;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(spot.name);
  const [note, setNote] = useState(spot.note);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const save = async () => {
    await db.putSpot({ ...spot, name: name.trim() || spot.name, note, nameSource: "manual" });
    await onSaved();
    onClose();
  };

  const remove = async () => {
    await db.deleteSpot(spot.id);
    await onSaved();
    onClose();
  };

  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="spot-edit-title">
      <div className="stack">
        <h2 id="spot-edit-title" style={{ fontSize: 17 }}>スポットを編集</h2>
        <label>
          名前
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          メモ
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <div className="row">
          <button type="button" className="btn-danger" onClick={remove}>
            削除
          </button>
          <div className="spacer" />
          <button type="button" onClick={onClose}>
            キャンセル
          </button>
          <button type="button" className="btn-primary" style={{ width: "auto", padding: "10px 20px" }} onClick={save}>
            保存
          </button>
        </div>
      </div>
    </dialog>
  );
}

function TripEditDialog({
  trip,
  onClose,
  onSaved,
}: {
  trip: Trip;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState(trip.title);
  const [note, setNote] = useState(trip.note);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const save = async () => {
    await db.putTrip({ ...trip, title: title.trim() || trip.title, note });
    await onSaved();
    onClose();
  };

  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="trip-edit-title">
      <div className="stack">
        <h2 id="trip-edit-title" style={{ fontSize: 17 }}>旅を編集</h2>
        <label>
          タイトル
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          メモ
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <div className="row">
          <button type="button" onClick={onClose}>
            キャンセル
          </button>
          <div className="spacer" />
          <button type="button" className="btn-primary" style={{ width: "auto", padding: "10px 20px" }} onClick={save}>
            保存
          </button>
        </div>
      </div>
    </dialog>
  );
}
