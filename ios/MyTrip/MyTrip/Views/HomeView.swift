import SwiftData
import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var recorder: TripRecorder
    @Query(sort: \Trip.startedAt, order: .reverse) private var trips: [Trip]
    @State private var showRecording = false

    private var doneTrips: [Trip] {
        trips.filter { $0.status == .done && $0.archivedAt == nil }
    }

    private var hasArchived: Bool {
        trips.contains { $0.archivedAt != nil }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    startButton
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                    if let message = recorder.errorMessage {
                        Text(message)
                            .font(.footnote)
                            .foregroundStyle(.red)
                    }
                } footer: {
                    Text("「旅をはじめる」を押すと、訪れたスポットと移動の足取りを自動で記録します。記録中の操作は不要です。")
                }

                Section("最近の旅") {
                    if doneTrips.isEmpty {
                        Text("まだ旅の記録がありません。最初の旅に出かけましょう。")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(doneTrips.prefix(5)) { trip in
                            NavigationLink(value: trip.id) {
                                TripRow(trip: trip)
                            }
                        }
                    }
                    if doneTrips.count > 5 || hasArchived {
                        NavigationLink("すべての旅を見る") {
                            TripListView()
                        }
                    }
                }
            }
            .navigationTitle("My Trip")
            .navigationDestination(for: UUID.self) { tripId in
                if let trip = doneTrips.first(where: { $0.id == tripId }) {
                    TripDetailView(trip: trip)
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink {
                        SettingsView()
                    } label: {
                        Label("設定", systemImage: "gearshape")
                    }
                }
            }
            .fullScreenCover(isPresented: $showRecording) {
                RecordingView()
            }
            .onAppear {
                showRecording = recorder.isRecording
            }
            .onChange(of: recorder.isRecording) { _, isRecording in
                showRecording = isRecording
            }
        }
    }

    private var startButton: some View {
        Button {
            if !recorder.isRecording {
                recorder.start()
            }
            showRecording = true
        } label: {
            Label(
                recorder.isRecording ? "記録中の旅を再開する" : "旅をはじめる",
                systemImage: recorder.isRecording ? "record.circle" : "figure.walk"
            )
            .font(.title3.bold())
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
        }
        .buttonStyle(.borderedProminent)
    }
}

struct TripRow: View {
    let trip: Trip

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(trip.title)
                .font(.headline)
            Text(subtitle)
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
    }

    private var subtitle: String {
        var parts = [Formatters.day(trip.startedAt), Formatters.distance(trip.distanceM)]
        if let endedAt = trip.endedAt {
            parts.append(Formatters.duration(endedAt.timeIntervalSince(trip.startedAt)))
        }
        return parts.joined(separator: "・")
    }
}
