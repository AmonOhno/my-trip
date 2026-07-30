import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { navigate } from "../app/router";
import { useRecorder } from "../app/useRecorder";
import { PlanMap } from "../components/PlanMap";
import * as db from "../core/db";
import { formatDateRange } from "../core/format";
import { reverseGeocode, searchPlaces, type PlaceSearchResult } from "../core/geocode";
import { fromDateInputValue, hasLocation, movePlanItem, planPins, toDateInputValue } from "../core/plan";
import { recorder } from "../core/recorder";
import type { PlanItem, Trip, TripPlan } from "../core/types";
import { TripCard } from "./HomePage";

/** 地図から追加するときに、名前だけ先に決めておくための下書き */
interface ItemDraft {
  lat: number;
  lng: number;
  name: string;
}

export function PlanDetailPage({ planId }: { planId: string }) {
  const rec = useRecorder();
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [items, setItems] = useState<PlanItem[]>([]);
  const [linkedTrip, setLinkedTrip] = useState<Trip | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [editingPlan, setEditingPlan] = useState(false);
  const [editingItem, setEditingItem] = useState<PlanItem | "new" | null>(null);
  const [draft, setDraft] = useState<ItemDraft | null>(null);
  const [picking, setPicking] = useState(false);
  const [pickBusy, setPickBusy] = useState(false);
  const [focusPinId, setFocusPinId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);

  const pins = useMemo(() => planPins(items), [items]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const p = await db.getPlan(planId);
      if (cancelled) return;
      if (!p) {
        setNotFound(true);
        return;
      }
      const [list, trip] = await Promise.all([
        db.listPlanItems(planId),
        p.tripId !== null ? db.getTrip(p.tripId) : Promise.resolve(undefined),
      ]);
      if (cancelled) return;
      setPlan(p);
      setItems(list);
      setLinkedTrip(trip ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [planId]);

  const reloadItems = useCallback(async () => {
    setItems(await db.listPlanItems(planId));
  }, [planId]);

  const onMoveItem = async (id: string, delta: -1 | 1) => {
    const moved = movePlanItem(items, id, delta);
    const changed = moved.filter((m) => !items.includes(m));
    await Promise.all(changed.map((m) => db.putPlanItem(m)));
    setItems(moved);
  };

  /** 地図タップ: 名前を先に取ってから追加ダイアログを開く(取得できなくても続行) */
  const onPickLocation = useCallback(async (lat: number, lng: number) => {
    setPicking(false);
    setPickBusy(true);
    const name = await reverseGeocode(lat, lng);
    setPickBusy(false);
    setDraft({ lat, lng, name: name ?? "" });
    setEditingItem("new");
  }, []);

  /** 検索結果はその場で1件追加する(名前と位置が揃っているため) */
  const onAddSearchResult = useCallback(
    async (result: PlaceSearchResult) => {
      const item: PlanItem = {
        id: crypto.randomUUID(),
        planId,
        name: result.name,
        note: "",
        order: items.length,
        lat: result.lat,
        lng: result.lng,
      };
      await db.putPlanItem(item);
      setItems(await db.listPlanItems(planId));
      setFocusPinId(item.id);
    },
    [items.length, planId],
  );

  const onOpenItem = useCallback((item: PlanItem) => {
    setFocusPinId(item.id);
    setEditingItem(item);
  }, []);

  const onStartTrip = async () => {
    if (!plan) return;
    setStarting(true);
    const trip = await recorder.start({ title: plan.title });
    if (trip) {
      await db.putPlan({ ...plan, tripId: trip.id });
    }
    setStarting(false);
    navigate("/recording");
  };

  const onDeletePlan = async () => {
    deleteDialogRef.current?.close();
    await db.deletePlan(planId);
    navigate("/plans");
  };

  if (notFound) {
    return (
      <p className="empty">
        この計画は見つかりませんでした。<a href="#/plans">計画一覧へ</a>
      </p>
    );
  }
  if (!plan) return null;

  const isRecording = rec.status === "recording";

  return (
    <>
      <header className="appbar">
        <button type="button" className="icon-btn" onClick={() => navigate("/plans")} aria-label="計画一覧へ戻る">
          ←
        </button>
        <h1 style={{ fontSize: 18 }}>{plan.title}</h1>
        <button type="button" className="icon-btn" onClick={() => setEditingPlan(true)}>
          編集
        </button>
      </header>

      <div className="stack">
        <span className="muted">{formatDateRange(plan.startDate, plan.endDate)}</span>
        {plan.note ? <p style={{ margin: 0 }}>{plan.note}</p> : null}

        <h2 className="section-title">行きたい場所</h2>

        <PlanMap
          pins={pins}
          picking={picking}
          onPick={onPickLocation}
          onSelectPin={setFocusPinId}
          focusPinId={focusPinId}
        />

        <PlaceSearchBox onAdd={onAddSearchResult} />

        <button type="button" aria-pressed={picking} onClick={() => setPicking((on) => !on)}>
          {picking ? "地図タップをやめる" : "地図をタップして登録"}
        </button>
        <p className="muted" aria-live="polite">
          {picking ? "地図の行きたい場所をタップしてください。" : ""}
          {pickBusy ? "場所の名前を調べています…" : ""}
        </p>

        {items.length === 0 ? (
          <p className="muted">行きたい場所を追加して、旅のしおりをつくりましょう。</p>
        ) : (
          <ol className="stack" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {items.map((item, i) => (
              <li key={item.id} className="plan-item">
                <button type="button" className="plan-item-main" onClick={() => onOpenItem(item)}>
                  <span className="name">
                    {i + 1}. {item.name}
                  </span>
                  <span className="muted">
                    {hasLocation(item) ? item.note || "タップして編集" : item.note ? `${item.note}(位置未設定)` : "位置未設定・タップして編集"}
                  </span>
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => onMoveItem(item.id, -1)}
                  disabled={i === 0}
                  aria-label={`${item.name} を上へ移動`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => onMoveItem(item.id, 1)}
                  disabled={i === items.length - 1}
                  aria-label={`${item.name} を下へ移動`}
                >
                  ↓
                </button>
              </li>
            ))}
          </ol>
        )}
        <button
          type="button"
          onClick={() => {
            setDraft(null);
            setEditingItem("new");
          }}
        >
          + 名前だけで追加
        </button>

        <h2 className="section-title">この計画の旅</h2>
        {linkedTrip ? (
          <TripCard trip={linkedTrip} />
        ) : isRecording ? (
          <p className="notice">別の旅を記録中です。記録を終了すると、この計画から旅をはじめられます。</p>
        ) : (
          <>
            <button type="button" className="btn-primary" onClick={onStartTrip} disabled={starting}>
              {starting ? "開始しています…" : "この計画で旅をはじめる"}
            </button>
            <p className="muted">計画のタイトルを引き継いで記録を開始し、この計画に旅の記録を紐づけます。</p>
          </>
        )}

        <button type="button" className="btn-danger" onClick={() => deleteDialogRef.current?.showModal()}>
          この計画を削除する
        </button>
      </div>

      {editingPlan ? (
        <PlanEditDialog
          plan={plan}
          onClose={() => setEditingPlan(false)}
          onSaved={async () => setPlan((await db.getPlan(planId)) ?? null)}
        />
      ) : null}

      {editingItem !== null ? (
        <PlanItemDialog
          planId={planId}
          item={editingItem === "new" ? null : editingItem}
          draft={editingItem === "new" ? draft : null}
          nextOrder={items.length}
          onClose={() => {
            setEditingItem(null);
            setDraft(null);
          }}
          onSaved={reloadItems}
        />
      ) : null}

      <dialog ref={deleteDialogRef} aria-labelledby="plan-del-title">
        <div className="stack">
          <h2 id="plan-del-title" style={{ fontSize: 17 }}>この計画を削除しますか?</h2>
          <p className="muted">行きたい場所リストも削除されます。記録済みの旅は削除されません。</p>
          <div className="row">
            <button type="button" onClick={() => deleteDialogRef.current?.close()}>
              キャンセル
            </button>
            <div className="spacer" />
            <button type="button" className="btn-danger" onClick={onDeletePlan}>
              削除する
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

function PlanEditDialog({
  plan,
  onClose,
  onSaved,
}: {
  plan: TripPlan;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState(plan.title);
  const [start, setStart] = useState(toDateInputValue(plan.startDate));
  const [end, setEnd] = useState(toDateInputValue(plan.endDate));
  const [note, setNote] = useState(plan.note);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const save = async () => {
    const startDate = fromDateInputValue(start) ?? plan.startDate;
    const endDate = fromDateInputValue(end) ?? plan.endDate;
    await db.putPlan({
      ...plan,
      title: title.trim() || plan.title,
      note,
      startDate,
      endDate: Math.max(startDate, endDate),
    });
    await onSaved();
    onClose();
  };

  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="plan-edit-title">
      <div className="stack">
        <h2 id="plan-edit-title" style={{ fontSize: 17 }}>計画を編集</h2>
        <label>
          タイトル
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          開始日
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label>
          終了日
          <input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
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

/** 場所の名前で検索して、そのまま計画に追加する */
function PlaceSearchBox({ onAdd }: { onAdd: (result: PlaceSearchResult) => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  const search = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setResults(await searchPlaces(q));
    setSearching(false);
  };

  return (
    <>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <input
          type="search"
          name="place"
          autoComplete="off"
          value={query}
          placeholder="例: 鶴岡八幡宮"
          aria-label="行きたい場所を検索"
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" disabled={searching || query.trim() === ""}>
          {searching ? "検索中…" : "検索"}
        </button>
      </form>

      <div aria-live="polite">
        {results === null ? null : results.length === 0 ? (
          <p className="muted">見つかりませんでした。別の名前で探すか、地図をタップして登録してください。</p>
        ) : (
          <ul className="stack" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {results.map((result) => (
              <li key={result.id} className="plan-item">
                <button
                  type="button"
                  className="plan-item-main"
                  onClick={() => {
                    void onAdd(result);
                    setResults(null);
                    setQuery("");
                  }}
                >
                  <span className="name">{result.name}</span>
                  <span className="muted clamp-2">{result.address}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function PlanItemDialog({
  planId,
  item,
  draft,
  nextOrder,
  onClose,
  onSaved,
}: {
  planId: string;
  item: PlanItem | null;
  /** 地図タップで決まった位置と、逆ジオコーディングで拾えた名前 */
  draft: ItemDraft | null;
  nextOrder: number;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(item?.name ?? draft?.name ?? "");
  const [note, setNote] = useState(item?.note ?? "");
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(() => {
    if (item && hasLocation(item)) return { lat: item.lat, lng: item.lng };
    return draft ? { lat: draft.lat, lng: draft.lng } : null;
  });

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const save = async () => {
    const trimmed = name.trim();
    const lat = location?.lat ?? null;
    const lng = location?.lng ?? null;
    if (item) {
      await db.putPlanItem({ ...item, name: trimmed || item.name, note, lat, lng });
    } else {
      if (!trimmed) return;
      await db.putPlanItem({
        id: crypto.randomUUID(),
        planId,
        name: trimmed,
        note,
        order: nextOrder,
        lat,
        lng,
      });
    }
    await onSaved();
    onClose();
  };

  const remove = async () => {
    if (!item) return;
    await db.deletePlanItem(item.id);
    await onSaved();
    onClose();
  };

  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="plan-item-title">
      <div className="stack">
        <h2 id="plan-item-title" style={{ fontSize: 17 }}>
          {item ? "行きたい場所を編集" : "行きたい場所を追加"}
        </h2>
        <label>
          名前
          <input
            type="text"
            value={name}
            placeholder="例: 鶴岡八幡宮"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          メモ
          <textarea
            rows={3}
            value={note}
            placeholder="例: 10時ごろ。参道でお団子"
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        {location ? (
          <div className="row">
            <span className="muted">
              地図に表示: {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
            </span>
            <div className="spacer" />
            <button type="button" onClick={() => setLocation(null)}>
              位置を外す
            </button>
          </div>
        ) : (
          <p className="muted">位置は未設定です。地図をタップするか検索して登録すると、地図にピンが立ちます。</p>
        )}
        <div className="row">
          {item ? (
            <button type="button" className="btn-danger" onClick={remove}>
              削除
            </button>
          ) : null}
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
