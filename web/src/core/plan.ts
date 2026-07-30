import type { LocatedPlanItem, PlanItem, TripPlan } from "./types";

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

/** 地図に立てるピン。番号は一覧での表示順(1始まり)に揃える */
export interface PlanPin {
  id: string;
  name: string;
  lat: number;
  lng: number;
  number: number;
}

/** 位置が入っている場所か */
export function hasLocation(item: PlanItem): item is LocatedPlanItem {
  return item.lat !== null && item.lng !== null;
}

/**
 * 一覧(order順)からピンを作る。位置未設定の場所は地図に出ないが、
 * 番号は一覧の並びそのままなので「3番の場所」が一覧と地図で一致する。
 */
export function planPins(items: readonly PlanItem[]): PlanPin[] {
  const sorted = [...items].sort((a, b) => a.order - b.order);
  const pins: PlanPin[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i];
    if (!hasLocation(item)) continue;
    pins.push({ id: item.id, name: item.name, lat: item.lat, lng: item.lng, number: i + 1 });
  }
  return pins;
}

/** ピン全体が収まる範囲 `[[南,西],[北,東]]`。ピンがなければ null */
export function planPinsBounds(
  pins: readonly PlanPin[],
): [[number, number], [number, number]] | null {
  if (pins.length === 0) return null;
  let south = pins[0].lat;
  let north = pins[0].lat;
  let west = pins[0].lng;
  let east = pins[0].lng;
  for (let i = 1; i < pins.length; i++) {
    const { lat, lng } = pins[i];
    if (lat < south) south = lat;
    if (lat > north) north = lat;
    if (lng < west) west = lng;
    if (lng > east) east = lng;
  }
  return [[south, west], [north, east]];
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
