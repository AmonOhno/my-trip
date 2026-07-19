import SwiftData
import SwiftUI

struct PlanListView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \TripPlan.startDate) private var plans: [TripPlan]
    @State private var newPlan: TripPlan?

    private var ongoing: [TripPlan] { plans.filter { $0.phase() == .ongoing } }
    private var upcoming: [TripPlan] { plans.filter { $0.phase() == .upcoming } }
    private var past: [TripPlan] { plans.filter { $0.phase() == .past }.reversed() }

    var body: some View {
        List {
            if plans.isEmpty {
                Text("まだ計画がありません。次の旅の行き先を考えましょう。")
                    .foregroundStyle(.secondary)
            }
            planSection("旅の期間中", ongoing)
            planSection("これからの旅", upcoming)
            planSection("過去の計画", past)
        }
        .navigationTitle("旅の計画")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("新しい計画", systemImage: "plus") {
                    createPlan()
                }
            }
        }
        .navigationDestination(item: $newPlan) { plan in
            PlanDetailView(plan: plan)
        }
    }

    @ViewBuilder
    private func planSection(_ title: String, _ items: [TripPlan]) -> some View {
        if !items.isEmpty {
            Section(title) {
                ForEach(items) { plan in
                    NavigationLink {
                        PlanDetailView(plan: plan)
                    } label: {
                        PlanRow(plan: plan)
                    }
                    .swipeActions(edge: .trailing) {
                        Button("削除", systemImage: "trash", role: .destructive) {
                            delete(plan)
                        }
                    }
                }
            }
        }
    }

    private func createPlan() {
        let today = Calendar.current.startOfDay(for: Date())
        let plan = TripPlan(title: "新しい旅の計画", startDate: today, endDate: today)
        context.insert(plan)
        try? context.save()
        newPlan = plan
    }

    private func delete(_ plan: TripPlan) {
        let planId = plan.id
        try? context.delete(model: PlanItem.self, where: #Predicate { $0.planId == planId })
        context.delete(plan)
        try? context.save()
    }
}

struct PlanRow: View {
    let plan: TripPlan

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 6) {
                Text(plan.title)
                    .font(.headline)
                if plan.tripId != nil {
                    Text("記録済み")
                        .font(.caption.bold())
                        .padding(.horizontal, 8)
                        .padding(.vertical, 1)
                        .foregroundStyle(.orange)
                        .background(.orange.opacity(0.12), in: Capsule())
                }
            }
            Text(Formatters.dateRange(plan.startDate, plan.endDate))
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
    }
}
