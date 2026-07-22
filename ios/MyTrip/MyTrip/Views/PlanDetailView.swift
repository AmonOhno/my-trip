import SwiftData
import SwiftUI

struct PlanDetailView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var recorder: TripRecorder
    @Bindable var plan: TripPlan
    @Query private var items: [PlanItem]
    @State private var newItemName = ""
    @State private var editingItem: PlanItem?
    @State private var showDeleteConfirm = false

    init(plan: TripPlan) {
        self.plan = plan
        let planId = plan.id
        _items = Query(
            filter: #Predicate<PlanItem> { $0.planId == planId },
            sort: [SortDescriptor(\PlanItem.order)]
        )
    }

    private var linkedTrip: Trip? {
        guard let tripId = plan.tripId else { return nil }
        var descriptor = FetchDescriptor<Trip>(predicate: #Predicate { $0.id == tripId })
        descriptor.fetchLimit = 1
        return try? context.fetch(descriptor).first
    }

    var body: some View {
        List {
            Section("計画") {
                TextField("タイトル", text: $plan.title)
                    .font(.headline)
                DatePicker("開始日", selection: $plan.startDate, displayedComponents: .date)
                DatePicker("終了日", selection: $plan.endDate, in: plan.startDate..., displayedComponents: .date)
                TextField("メモ", text: $plan.note, axis: .vertical)
                    .lineLimit(3...6)
            }

            Section("行きたい場所") {
                if items.isEmpty {
                    Text("行きたい場所を追加して、旅のしおりをつくりましょう。")
                        .foregroundStyle(.secondary)
                }
                ForEach(items) { item in
                    Button {
                        editingItem = item
                    } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.name)
                                .font(.body.bold())
                            if !item.note.isEmpty {
                                Text(item.note)
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                    .foregroundStyle(.primary)
                }
                .onDelete(perform: deleteItems)
                .onMove(perform: moveItems)

                HStack {
                    TextField("場所を追加", text: $newItemName)
                        .onSubmit(addItem)
                    Button("追加", action: addItem)
                        .disabled(newItemName.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }

            Section("この計画の旅") {
                if let trip = linkedTrip {
                    NavigationLink {
                        TripDetailView(trip: trip)
                    } label: {
                        TripRow(trip: trip)
                    }
                } else if recorder.isRecording {
                    Text("別の旅を記録中です。記録を終了すると、この計画から旅をはじめられます。")
                        .foregroundStyle(.secondary)
                } else {
                    Button {
                        startTrip()
                    } label: {
                        Label("この計画で旅をはじめる", systemImage: "figure.walk")
                            .font(.body.bold())
                    }
                }
            }

            Section {
                Button("この計画を削除する", role: .destructive) {
                    showDeleteConfirm = true
                }
            }
        }
        .navigationTitle(plan.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                EditButton()
            }
        }
        .sheet(item: $editingItem) { item in
            PlanItemEditSheet(item: item)
        }
        .onChange(of: plan.startDate) { _, newStart in
            if plan.endDate < newStart {
                plan.endDate = newStart
            }
        }
        .onDisappear {
            if plan.title.trimmingCharacters(in: .whitespaces).isEmpty {
                plan.title = "新しい旅の計画"
            }
            try? context.save()
        }
        .confirmationDialog("この計画を削除しますか?", isPresented: $showDeleteConfirm, titleVisibility: .visible) {
            Button("削除する", role: .destructive) {
                deletePlan()
            }
            Button("キャンセル", role: .cancel) {}
        } message: {
            Text("行きたい場所リストも削除されます。記録済みの旅は削除されません。")
        }
    }

    private func addItem() {
        let name = newItemName.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return }
        context.insert(PlanItem(planId: plan.id, name: name, order: items.count))
        newItemName = ""
        try? context.save()
    }

    private func deleteItems(at offsets: IndexSet) {
        for index in offsets {
            context.delete(items[index])
        }
        normalizeOrders(excluding: offsets)
        try? context.save()
    }

    private func moveItems(from source: IndexSet, to destination: Int) {
        var reordered = items
        reordered.move(fromOffsets: source, toOffset: destination)
        for (i, item) in reordered.enumerated() where item.order != i {
            item.order = i
        }
        try? context.save()
    }

    private func normalizeOrders(excluding removed: IndexSet) {
        let remaining = items.enumerated().filter { !removed.contains($0.offset) }.map(\.element)
        for (i, item) in remaining.enumerated() where item.order != i {
            item.order = i
        }
    }

    private func startTrip() {
        guard let trip = recorder.start(title: plan.title) else { return }
        plan.tripId = trip.id
        try? context.save()
    }

    private func deletePlan() {
        let planId = plan.id
        try? context.delete(model: PlanItem.self, where: #Predicate { $0.planId == planId })
        context.delete(plan)
        try? context.save()
        dismiss()
    }
}

/// 行きたい場所の名前・メモ編集シート
struct PlanItemEditSheet: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @Bindable var item: PlanItem

    var body: some View {
        NavigationStack {
            Form {
                TextField("名前", text: $item.name)
                TextField("メモ", text: $item.note, axis: .vertical)
                    .lineLimit(3...6)
                Section {
                    Button("この場所を削除", role: .destructive) {
                        context.delete(item)
                        try? context.save()
                        dismiss()
                    }
                }
            }
            .navigationTitle("行きたい場所")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("完了") {
                        try? context.save()
                        dismiss()
                    }
                }
            }
        }
        .presentationDetents([.medium])
    }
}
