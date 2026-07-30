import MapKit
import SwiftData
import SwiftUI

/// 地図タップで決まった位置と、逆ジオコーディングで拾えた名前
struct PlanItemDraft: Identifiable {
    let id = UUID()
    let coordinate: CLLocationCoordinate2D
    let suggestedName: String
}

struct PlanDetailView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var recorder: TripRecorder
    @Bindable var plan: TripPlan
    @Query private var items: [PlanItem]
    @State private var newItemName = ""
    @State private var editingItem: PlanItem?
    @State private var showDeleteConfirm = false
    @State private var picking = false
    @State private var pickBusy = false
    @State private var focusPinId: UUID?
    @State private var draft: PlanItemDraft?
    @State private var searchQuery = ""
    @State private var searchResults: [MKMapItem] = []
    @State private var searching = false
    @State private var searched = false

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

            Section("地図") {
                PlanMapView(
                    pins: pins,
                    picking: picking,
                    focusPinId: focusPinId,
                    onPick: pickLocation,
                    onSelectPin: { focusPinId = $0 }
                )
                .frame(height: 240)
                .listRowInsets(EdgeInsets())

                Toggle("地図をタップして登録", isOn: $picking)
                if picking {
                    Text("地図の行きたい場所をタップしてください。")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                if pickBusy {
                    Text("場所の名前を調べています…")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                HStack {
                    TextField("行きたい場所を検索", text: $searchQuery)
                        .submitLabel(.search)
                        .onSubmit(searchPlaces)
                    Button("検索", action: searchPlaces)
                        .disabled(searching || searchQuery.trimmingCharacters(in: .whitespaces).isEmpty)
                }
                if searched && searchResults.isEmpty && !searching {
                    Text("見つかりませんでした。別の名前で探すか、地図をタップして登録してください。")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                ForEach(searchResults, id: \.self) { result in
                    Button {
                        addSearchResult(result)
                    } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(result.name ?? searchQuery)
                                .font(.body.bold())
                            Text(addressLine(result))
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .foregroundStyle(.primary)
                }
            }

            Section("行きたい場所") {
                if items.isEmpty {
                    Text("行きたい場所を追加して、旅のしおりをつくりましょう。")
                        .foregroundStyle(.secondary)
                }
                ForEach(items) { item in
                    Button {
                        focusPinId = item.id
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
                            if item.coordinate == nil {
                                Text("位置未設定")
                                    .font(.caption)
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
        .sheet(item: $draft) { draft in
            PlanItemDraftSheet(draft: draft) { name, note in
                addItem(name: name, note: note, coordinate: draft.coordinate)
            }
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

    private var pins: [PlanPin] {
        PlanPins.make(from: items)
    }

    private func addItem() {
        let name = newItemName.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return }
        context.insert(PlanItem(planId: plan.id, name: name, order: items.count))
        newItemName = ""
        try? context.save()
    }

    /// 位置つきで1件追加する
    private func addItem(name: String, note: String, coordinate: CLLocationCoordinate2D?) {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }
        let item = PlanItem(
            planId: plan.id,
            name: trimmed,
            order: items.count,
            lat: coordinate?.latitude,
            lng: coordinate?.longitude
        )
        item.note = note
        context.insert(item)
        try? context.save()
        focusPinId = item.id
    }

    /// 地図タップ: 名前を先に取ってから追加シートを開く(取得できなくても続行)
    private func pickLocation(_ coordinate: CLLocationCoordinate2D) {
        picking = false
        pickBusy = true
        Task {
            let name = await PlaceNaming.name(at: coordinate)
            pickBusy = false
            draft = PlanItemDraft(coordinate: coordinate, suggestedName: name ?? "")
        }
    }

    /// MKLocalSearch(Apple純正・無料)で地名を検索する
    private func searchPlaces() {
        let query = searchQuery.trimmingCharacters(in: .whitespaces)
        guard !query.isEmpty else { return }
        searching = true
        let request = MKLocalSearch.Request()
        request.naturalLanguageQuery = query
        Task {
            let response = try? await MKLocalSearch(request: request).start()
            searchResults = Array((response?.mapItems ?? []).prefix(5))
            searching = false
            searched = true
        }
    }

    private func addSearchResult(_ result: MKMapItem) {
        addItem(
            name: result.name ?? searchQuery,
            note: "",
            coordinate: result.placemark.coordinate
        )
        searchResults = []
        searchQuery = ""
        searched = false
    }

    private func addressLine(_ result: MKMapItem) -> String {
        let placemark = result.placemark
        let parts = [placemark.administrativeArea, placemark.locality, placemark.thoroughfare]
        return parts.compactMap { $0 }.joined(separator: " ")
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

/// 地図でタップした場所に名前をつけて追加するシート
struct PlanItemDraftSheet: View {
    let draft: PlanItemDraft
    var onSave: (String, String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var note = ""

    init(draft: PlanItemDraft, onSave: @escaping (String, String) -> Void) {
        self.draft = draft
        self.onSave = onSave
        _name = State(initialValue: draft.suggestedName)
    }

    var body: some View {
        NavigationStack {
            Form {
                TextField("名前", text: $name)
                TextField("メモ", text: $note, axis: .vertical)
                    .lineLimit(3...6)
                Section("位置") {
                    Text(coordinateLabel(draft.coordinate))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("行きたい場所を追加")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("キャンセル") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("追加") {
                        onSave(name, note)
                        dismiss()
                    }
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
        .presentationDetents([.medium])
    }
}

/// 座標を「緯度, 経度」で表示する(小数5桁 ≒ 1m)
func coordinateLabel(_ coordinate: CLLocationCoordinate2D) -> String {
    String(format: "%.5f, %.5f", coordinate.latitude, coordinate.longitude)
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
                Section("位置") {
                    if let coordinate = item.coordinate {
                        Text(coordinateLabel(coordinate))
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        Button("位置を外す") {
                            item.lat = nil
                            item.lng = nil
                            try? context.save()
                        }
                    } else {
                        Text("位置は未設定です。地図をタップするか検索して登録すると、地図にピンが立ちます。")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
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
