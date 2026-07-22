import { useEffect, useState } from "react";
import { navigate } from "../app/router";
import * as db from "../core/db";
import { formatDateRange } from "../core/format";
import { planPhase, sortPlansForList, startOfDay, type PlanPhase } from "../core/plan";
import type { TripPlan } from "../core/types";

const PHASE_LABEL: Record<PlanPhase, string> = {
  ongoing: "旅の期間中",
  upcoming: "これからの旅",
  past: "過去の計画",
};

export function PlanListPage() {
  const [plans, setPlans] = useState<TripPlan[] | null>(null);
  const [itemCounts, setItemCounts] = useState<ReadonlyMap<string, number>>(new Map());

  useEffect(() => {
    void (async () => {
      const all = sortPlansForList(await db.listPlans(), Date.now());
      const counts = await Promise.all(
        all.map(async (p) => [p.id, (await db.listPlanItems(p.id)).length] as const),
      );
      setPlans(all);
      setItemCounts(new Map(counts));
    })();
  }, []);

  const onCreate = async () => {
    const now = Date.now();
    const today = startOfDay(now);
    const plan: TripPlan = {
      id: crypto.randomUUID(),
      title: "新しい旅の計画",
      note: "",
      startDate: today,
      endDate: today,
      createdAt: now,
      tripId: null,
    };
    await db.putPlan(plan);
    navigate(`/plans/${plan.id}`);
  };

  // 表示順のままフェーズが変わる位置に見出しを挟む
  let lastPhase: PlanPhase | null = null;
  const now = Date.now();

  return (
    <>
      <header className="appbar">
        <button type="button" className="icon-btn" onClick={() => navigate("/")} aria-label="ホームへ戻る">
          ←
        </button>
        <h1>旅の計画</h1>
      </header>

      <div className="stack">
        <button type="button" className="btn-primary" onClick={onCreate}>
          新しい計画をつくる
        </button>

        {plans === null ? null : plans.length === 0 ? (
          <p className="empty">まだ計画がありません。次の旅の行き先を考えましょう。</p>
        ) : (
          plans.map((p) => {
            const phase = planPhase(p, now);
            const heading =
              phase !== lastPhase ? (
                <h2 className="section-title">{PHASE_LABEL[phase]}</h2>
              ) : null;
            lastPhase = phase;
            return (
              <div key={p.id} className="stack">
                {heading}
                <PlanCard plan={p} itemCount={itemCounts.get(p.id)} />
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

export function PlanCard({ plan, itemCount }: { plan: TripPlan; itemCount?: number }) {
  const parts = [formatDateRange(plan.startDate, plan.endDate)];
  if (itemCount !== undefined && itemCount > 0) parts.push(`行きたい場所 ${itemCount}件`);
  return (
    <a className="trip-card" href={`#/plans/${plan.id}`}>
      <h3>
        {plan.title}
        {plan.tripId !== null ? (
          <>
            {" "}
            <span className="badge">記録済み</span>
          </>
        ) : null}
      </h3>
      <span className="muted">{parts.join("・")}</span>
    </a>
  );
}
