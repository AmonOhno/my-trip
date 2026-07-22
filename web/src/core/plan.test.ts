import { describe, expect, it } from "vitest";
import {
  activePlans,
  fromDateInputValue,
  movePlanItem,
  planPhase,
  sortPlansForList,
  startOfDay,
  toDateInputValue,
} from "./plan";
import type { PlanItem, TripPlan } from "./types";

/** ローカル日付の epoch ms */
function day(y: number, m: number, d: number): number {
  return new Date(y, m - 1, d).getTime();
}

function plan(id: string, start: number, end: number, createdAt = 0): TripPlan {
  return {
    id,
    title: id,
    note: "",
    startDate: start,
    endDate: end,
    createdAt,
    tripId: null,
  };
}

describe("startOfDay", () => {
  it("同日の任意の時刻を0時に丸める", () => {
    const noon = new Date(2026, 6, 19, 12, 34, 56).getTime();
    expect(startOfDay(noon)).toBe(day(2026, 7, 19));
  });
});

describe("planPhase", () => {
  const p = plan("p", day(2026, 7, 20), day(2026, 7, 22));

  it("開始日前日まで = upcoming", () => {
    expect(planPhase(p, new Date(2026, 6, 19, 23, 59).getTime())).toBe("upcoming");
  });

  it("開始日〜終了日 = ongoing(境界日を含む)", () => {
    expect(planPhase(p, new Date(2026, 6, 20, 0, 0).getTime())).toBe("ongoing");
    expect(planPhase(p, new Date(2026, 6, 21, 12, 0).getTime())).toBe("ongoing");
    expect(planPhase(p, new Date(2026, 6, 22, 23, 59).getTime())).toBe("ongoing");
  });

  it("終了日の翌日以降 = past", () => {
    expect(planPhase(p, new Date(2026, 6, 23, 0, 0).getTime())).toBe("past");
  });

  it("日帰り(開始日=終了日)も当日は ongoing", () => {
    const oneDay = plan("d", day(2026, 7, 20), day(2026, 7, 20));
    expect(planPhase(oneDay, new Date(2026, 6, 20, 18, 0).getTime())).toBe("ongoing");
  });
});

describe("sortPlansForList / activePlans", () => {
  const now = new Date(2026, 6, 19, 12, 0).getTime();
  const ongoing = plan("ongoing", day(2026, 7, 18), day(2026, 7, 20));
  const soon = plan("soon", day(2026, 7, 21), day(2026, 7, 22));
  const later = plan("later", day(2026, 8, 1), day(2026, 8, 3));
  const pastNew = plan("pastNew", day(2026, 7, 10), day(2026, 7, 11));
  const pastOld = plan("pastOld", day(2026, 6, 1), day(2026, 6, 2));

  it("進行中 → これから(近い順) → 過去(新しい順)", () => {
    const sorted = sortPlansForList([pastOld, later, ongoing, pastNew, soon], now);
    expect(sorted.map((p) => p.id)).toEqual(["ongoing", "soon", "later", "pastNew", "pastOld"]);
  });

  it("activePlans は過去の計画を除く", () => {
    const active = activePlans([pastOld, later, ongoing, pastNew, soon], now);
    expect(active.map((p) => p.id)).toEqual(["ongoing", "soon", "later"]);
  });
});

describe("movePlanItem", () => {
  function item(id: string, order: number): PlanItem {
    return { id, planId: "p", name: id, note: "", order };
  }
  const items = [item("a", 0), item("b", 1), item("c", 2)];

  it("下へ移動して order を振り直す", () => {
    const moved = movePlanItem(items, "a", 1);
    expect(moved.map((i) => i.id)).toEqual(["b", "a", "c"]);
    expect(moved.map((i) => i.order)).toEqual([0, 1, 2]);
  });

  it("上へ移動できる", () => {
    const moved = movePlanItem(items, "c", -1);
    expect(moved.map((i) => i.id)).toEqual(["a", "c", "b"]);
  });

  it("端では動かないが order は正規化される", () => {
    const gappy = [item("a", 3), item("b", 7)];
    const moved = movePlanItem(gappy, "a", -1);
    expect(moved.map((i) => i.id)).toEqual(["a", "b"]);
    expect(moved.map((i) => i.order)).toEqual([0, 1]);
  });
});

describe("date input 変換", () => {
  it("epoch ms ⇔ YYYY-MM-DD を往復できる", () => {
    const ms = day(2026, 7, 5);
    expect(toDateInputValue(ms)).toBe("2026-07-05");
    expect(fromDateInputValue("2026-07-05")).toBe(ms);
  });

  it("不正な値は null", () => {
    expect(fromDateInputValue("")).toBeNull();
    expect(fromDateInputValue("2026-7-5")).toBeNull();
  });
});
