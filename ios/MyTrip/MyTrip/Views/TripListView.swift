import SwiftData
import SwiftUI

struct TripListView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \Trip.startedAt, order: .reverse) private var trips: [Trip]
    @State private var showArchived = false

    private var doneTrips: [Trip] {
        trips.filter { $0.status == .done && (($0.archivedAt != nil) == showArchived) }
    }

    private var hasArchived: Bool {
        trips.contains { $0.archivedAt != nil }
    }

    var body: some View {
        List {
            if hasArchived {
                Picker("表示", selection: $showArchived) {
                    Text("旅").tag(false)
                    Text("アーカイブ").tag(true)
                }
                .pickerStyle(.segmented)
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
            }

            if doneTrips.isEmpty {
                Text(showArchived ? "アーカイブした旅はありません。" : "まだ旅の記録がありません。")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(doneTrips) { trip in
                    NavigationLink {
                        TripDetailView(trip: trip)
                    } label: {
                        TripRow(trip: trip)
                    }
                    .swipeActions(edge: .trailing) {
                        Button(
                            trip.archivedAt == nil ? "アーカイブ" : "戻す",
                            systemImage: trip.archivedAt == nil ? "archivebox" : "tray.and.arrow.up"
                        ) {
                            trip.archivedAt = trip.archivedAt == nil ? Date() : nil
                            try? context.save()
                        }
                        .tint(.orange)
                    }
                }
            }
        }
        .navigationTitle(showArchived ? "アーカイブ" : "すべての旅")
    }
}
