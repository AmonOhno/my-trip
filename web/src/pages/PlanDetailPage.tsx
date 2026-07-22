import { useCallback, useEffect, useRef, useState } from "react";
import { navigate } from "../app/router";
import { useRecorder } from "../app/useRecorder";
import * as db from "../core/db";
import { formatDateRange } from "../core/format";
import { fromDateInputValue, movePlanItem, toDateInputValue } from "../core/plan";
import { recorder } from "../core/recorder";
import type { PlanItem, Trip, TripPlan } from "../core/types";
import { TripCard } from "./HomePage";

export function PlanDetailPage({ planId }: { planId: string }) {
  const rec = useRecorder();
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [items, setItems] = useState<PlanItem[]>([]);
  const [linkedTrip, setLinkedTrip] = useState<Trip | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [editingPlan, setEditingPlan] = useState(false);
  const [editingItem, setEditingItem] = useState<PlanItem | "new" | null>(null);
  const [starting, setStarting] = useState(false);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);

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
        {items.length === 0 ? (
          <p className="muted">行きたい場所を追加して、旅のしおりをつくりましょう。</p>
        ) : (
          <ol className="stack" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {items.map((item, i) => (
              <li key={item.id} className="plan-item">
                <button type="button" className="plan-item-main" onClick={() => setEditingItem(item)}>
                  <span className="name">
                    {i + 1}. {item.name}
                  </span>
                  <span className="muted">{item.note || "タップして編集"}</span>
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
        <button type="button" onClick={() => setEditingItem("new")}>
          + 場所を追加
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
          nextOrder={items.length}
          onClose={() => setEditingItem(null)}
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

function PlanItemDialog({
  planId,
  item,
  nextOrder,
  onClose,
  onSaved,
}: {
  planId: string;
  item: PlanItem | null;
  nextOrder: number;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(item?.name ?? "");
  const [note, setNote] = useState(item?.note ?? "");

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const save = async () => {
    const trimmed = name.trim();
    if (item) {
      await db.putPlanItem({ ...item, name: trimmed || item.name, note });
    } else {
      if (!trimmed) return;
      await db.putPlanItem({
        id: crypto.randomUUID(),
        planId,
        name: trimmed,
        note,
        order: nextOrder,
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
