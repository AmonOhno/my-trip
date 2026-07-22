import type { PlanItem, TripPlan } from "./types";

/** 計画の進行状態(日単位で判定) */
export type PlanPhase = "upcoming" | "ongoing" | "past";

/** その日のローカル0時 (epoch ms) */
export function startOfDay(epochMs: number): number {
  const d = new Date(epochMs);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function planPhase(
  plan: Pick<TripPlan, "startDate" | "endDate">,
  nowMs: number,
): PlanPhase {
  const today = startOfDay(nowMs);
  if (today < startOfDay(plan.startDate)) return "upcoming";
  if (today > startOfDay(plan.endDate)) return "past";
  return "ongoing";
}

const PHASE_RANK: Record<PlanPhase, number> = { ongoing: 0, upcoming: 1, past: 2 };

/**
 * 一覧表示順: 進行中 → これから(開始日が近い順) → 過去(開始日が新しい順)。
 * 同日開始は作成が新しいものを先に。
 */
export function sortPlansForList(plans: TripPlan[], nowMs: number): TripPlan[] {
  return [...plans].sort((a, b) => {
    const pa = planPhase(a, nowMs);
    const pb = planPhase(b, nowMs);
    if (pa !== pb) return PHASE_RANK[pa] - PHASE_RANK[pb];
    if (a.startDate !== b.startDate) {
      return pa === "past" ? b.startDate - a.startDate : a.startDate - b.startDate;
    }
    return b.createdAt - a.createdAt;
  });
}

/** ホームに出す計画: 進行中・これから のみ */
export function activePlans(plans: TripPlan[], nowMs: number): TripPlan[] {
  return sortPlansForList(plans, nowMs).filter((p) => planPhase(p, nowMs) !== "past");
}

/**
 * 行きたい場所の並べ替え(上へ/下へ)。order を 0 始まりに振り直した配列を返す。
 * 端で動かせない場合も order は正規化される。
 */
export function movePlanItem(items: PlanItem[], id: string, delta: -1 | 1): PlanItem[] {
  const sorted = [...items].sort((a, b) => a.order - b.order);
  const from = sorted.findIndex((i) => i.id === id);
  const to = from + delta;
  if (from >= 0 && to >= 0 && to < sorted.length) {
    [sorted[from], sorted[to]] = [sorted[to], sorted[from]];
  }
  return sorted.map((item, i) => (item.order === i ? item : { ...item, order: i }));
}

/** `<input type="date">` 用の値 (YYYY-MM-DD、ローカル日付) */
export function toDateInputValue(epochMs: number): string {
  const d = new Date(epochMs);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** `<input type="date">` の値 (YYYY-MM-DD) をローカル0時の epoch ms に変換 */
export function fromDateInputValue(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const ms = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  return Number.isNaN(ms) ? null : ms;
}
