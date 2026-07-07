import SwiftData
import SwiftUI

struct TripListView: View {
    @Query(sort: \Trip.startedAt, order: .reverse) private var trips: [Trip]

    private var doneTrips: [Trip] {
        trips.filter { $0.status == .done }
    }

    var body: some View {
        List {
            if doneTrips.isEmpty {
                Text("まだ旅の記録がありません。")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(doneTrips) { trip in
                    NavigationLink {
                        TripDetailView(trip: trip)
                    } label: {
                        TripRow(trip: trip)
                    }
                }
            }
        }
        .navigationTitle("すべての旅")
    }
}
