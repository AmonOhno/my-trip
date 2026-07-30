import CoreLocation
import PhotosUI
import SwiftData
import SwiftUI

struct RecordingView: View {
    @EnvironmentObject private var recorder: TripRecorder
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @Query(sort: \TripPoint.timestamp) private var allPoints: [TripPoint]
    @Query(sort: \TripPhoto.createdAt) private var allPhotos: [TripPhoto]
    @State private var showStopConfirm = false
    @State private var stopping = false
    @State private var editingTrip: Trip?
    @State private var pickerItems: [PhotosPickerItem] = []
    @State private var viewingPhoto: TripPhoto?

    private var points: [TripPoint] {
        guard let tripId = recorder.currentTrip?.id else { return [] }
        return allPoints.filter { $0.tripId == tripId }
    }

    private var photos: [TripPhoto] {
        guard let tripId = recorder.currentTrip?.id else { return [] }
        return allPhotos.filter { $0.tripId == tripId }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    map
                        .listRowInsets(EdgeInsets())
                    stats
                    if let message = recorder.errorMessage {
                        Text(message)
                            .font(.footnote)
                            .foregroundStyle(.red)
                    }
                }

                Section("立ち寄ったスポット") {
                    if recorder.spots.isEmpty {
                        Text("まだスポットはありません。同じ場所に10分ほど滞在すると自動で記録されます。")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(recorder.spots) { spot in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(spot.name)
                                    .font(.headline)
                                Text(stayLabel(spot))
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }

                Section("メモ・写真") {
                    Button {
                        editingTrip = recorder.currentTrip
                    } label: {
                        if let note = recorder.currentTrip?.note, !note.isEmpty {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(note)
                                    .lineLimit(3)
                                Text("タップしてメモを編集")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        } else {
                            Label("メモを追加", systemImage: "square.and.pencil")
                        }
                    }
                    .tint(.primary)

                    if !photos.isEmpty {
                        TripPhotoGrid(photos: photos) { photo in
                            viewingPhoto = photo
                        } onDelete: { photo in
                            context.delete(photo)
                            try? context.save()
                        }
                        .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                    }
                    PhotosPicker(selection: $pickerItems, maxSelectionCount: 20, matching: .images) {
                        Label("写真を追加", systemImage: "photo.badge.plus")
                    }
                }

                Section {
                    Button(role: .destructive) {
                        showStopConfirm = true
                    } label: {
                        Label("旅を終了する", systemImage: "stop.fill")
                            .frame(maxWidth: .infinity)
                    }
                    .disabled(stopping)
                }
            }
            .navigationTitle(elapsedTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    HStack(spacing: 6) {
                        Image(systemName: "record.circle.fill")
                            .foregroundStyle(.red)
                        Text("記録中")
                            .font(.headline)
                            .foregroundStyle(.red)
                    }
                    .accessibilityElement(children: .combine)
                }
            }
            .sheet(item: $editingTrip) { trip in
                TripEditSheet(trip: trip)
            }
            .sheet(item: $viewingPhoto) { photo in
                PhotoViewerSheet(photo: photo) {
                    context.delete(photo)
                    try? context.save()
                }
            }
            .onChange(of: pickerItems) { _, items in
                addPhotos(items)
            }
            .confirmationDialog("旅を終了しますか?", isPresented: $showStopConfirm, titleVisibility: .visible) {
                Button("終了する", role: .destructive) {
                    stopping = true
                    Task {
                        _ = await recorder.stop()
                        stopping = false
                        dismiss()
                    }
                }
                Button("続ける", role: .cancel) {}
            } message: {
                Text("記録が確定し、旅一覧に保存されます。")
            }
        }
        .interactiveDismissDisabled()
    }

    private var elapsedTitle: String {
        guard let trip = recorder.currentTrip else { return "" }
        // lastLocation更新で再描画される簡易表示(秒精度が必要ならTimelineView化)
        return Formatters.elapsed(Date().timeIntervalSince(trip.startedAt))
    }

    private var map: some View {
        TripMapView(
            track: points.map { CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lng) },
            markers: recorder.spots.enumerated().map { index, spot in
                TripMapMarker(
                    id: spot.id.uuidString,
                    title: "\(index + 1). \(spot.name)",
                    latitude: spot.lat,
                    longitude: spot.lng
                )
            },
            showsUserLocation: true,
            follow: recorder.lastLocation?.coordinate
        )
        .frame(height: 260)
    }

    private var stats: some View {
        HStack {
            VStack(alignment: .leading) {
                Text(Formatters.distance(recorder.distanceM))
                    .font(.title2.bold())
                    .monospacedDigit()
                Text("移動距離")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            VStack(alignment: .leading) {
                Text("\(recorder.spots.count)")
                    .font(.title2.bold())
                    .monospacedDigit()
                Text("スポット")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding(.vertical, 4)
    }

    private func addPhotos(_ items: [PhotosPickerItem]) {
        guard !items.isEmpty, let tripId = recorder.currentTrip?.id else { return }
        Task {
            await PhotoImport.save(items, tripId: tripId, context: context)
            pickerItems = []
        }
    }

    private func stayLabel(_ spot: Spot) -> String {
        if let departedAt = spot.departedAt {
            return "\(Formatters.clock(spot.arrivedAt)) – \(Formatters.clock(departedAt))(\(Formatters.duration(departedAt.timeIntervalSince(spot.arrivedAt))))"
        }
        return "\(Formatters.clock(spot.arrivedAt)) – 滞在中"
    }
}
