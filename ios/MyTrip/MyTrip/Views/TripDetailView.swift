import MapKit
import PhotosUI
import SwiftData
import SwiftUI

struct TripDetailView: View {
    let trip: Trip

    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @Query(sort: \TripPoint.timestamp) private var allPoints: [TripPoint]
    @Query(sort: \Spot.arrivedAt) private var allSpots: [Spot]
    @Query(sort: \TripPhoto.createdAt) private var allPhotos: [TripPhoto]

    @State private var editingSpot: Spot?
    @State private var showTripEdit = false
    @State private var showDeleteConfirm = false
    @State private var mapCamera = MapCameraPosition.automatic
    @State private var pickerItems: [PhotosPickerItem] = []
    @State private var viewingPhoto: TripPhoto?

    private var points: [TripPoint] {
        allPoints.filter { $0.tripId == trip.id }
    }

    private var spots: [Spot] {
        allSpots.filter { $0.tripId == trip.id }
    }

    private var photos: [TripPhoto] {
        allPhotos.filter { $0.tripId == trip.id }
    }

    private var segments: [TimelineSegment] {
        TimelineBuilder.build(trip: trip, spots: spots, points: points)
    }

    var body: some View {
        List {
            Section {
                map
                    .listRowInsets(EdgeInsets())
                stats
            } header: {
                Text(Formatters.day(trip.startedAt))
            }

            if !trip.note.isEmpty {
                Section("メモ") {
                    Text(trip.note)
                }
            }

            Section("タイムライン") {
                ForEach(segments) { segment in
                    switch segment {
                    case .stay(let spot):
                        Button {
                            focus(on: spot)
                        } label: {
                            stayRow(spot)
                        }
                        .tint(.primary)
                    case .move(let from, let to, let distance):
                        Label(
                            "移動 \(Formatters.distance(distance))・\(Formatters.duration(to.timeIntervalSince(from)))",
                            systemImage: "figure.walk"
                        )
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    }
                }
            }

            Section("写真") {
                if !photos.isEmpty {
                    photoGrid
                        .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                }
                PhotosPicker(selection: $pickerItems, maxSelectionCount: 20, matching: .images) {
                    Label("写真を追加", systemImage: "photo.badge.plus")
                }
            }

            Section("スポットの編集") {
                ForEach(Array(spots.enumerated()), id: \.element.id) { index, spot in
                    Button {
                        editingSpot = spot
                    } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("\(index + 1). \(spot.name)")
                                .font(.headline)
                            Text(spot.note.isEmpty ? "タップして名前・メモを編集" : spot.note)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .tint(.primary)
                }
            }

            Section {
                Button("この旅を削除する", role: .destructive) {
                    showDeleteConfirm = true
                }
            }
        }
        .navigationTitle(trip.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button(trip.archivedAt == nil ? "アーカイブする" : "アーカイブから戻す",
                       systemImage: trip.archivedAt == nil ? "archivebox" : "tray.and.arrow.up") {
                    toggleArchive()
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button("編集") {
                    showTripEdit = true
                }
            }
        }
        .sheet(item: $editingSpot) { spot in
            SpotEditSheet(spot: spot)
        }
        .sheet(isPresented: $showTripEdit) {
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
        .confirmationDialog("この旅を削除しますか?", isPresented: $showDeleteConfirm, titleVisibility: .visible) {
            Button("削除する", role: .destructive) {
                try? ExportService.deleteTrip(id: trip.id, context: context)
                dismiss()
            }
            Button("キャンセル", role: .cancel) {}
        } message: {
            Text("軌跡・スポットを含むすべての記録が削除されます。元に戻せません。")
        }
    }

    private var map: some View {
        Map(position: $mapCamera) {
            if points.count > 1 {
                MapPolyline(coordinates: points.map {
                    CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lng)
                })
                .stroke(.orange, lineWidth: 4)
            }
            ForEach(Array(spots.enumerated()), id: \.element.id) { index, spot in
                Marker("\(index + 1). \(spot.name)",
                       coordinate: CLLocationCoordinate2D(latitude: spot.lat, longitude: spot.lng))
                    .tint(.orange)
            }
        }
        .frame(height: 280)
    }

    private var stats: some View {
        HStack {
            statTile(Formatters.distance(trip.distanceM), "移動距離")
            Spacer()
            if let endedAt = trip.endedAt {
                statTile(Formatters.duration(endedAt.timeIntervalSince(trip.startedAt)), "所要時間")
                Spacer()
            }
            statTile("\(spots.count)", "スポット")
            if let steps = trip.steps {
                Spacer()
                statTile(steps.formatted(), "歩数")
            }
        }
        .padding(.vertical, 4)
    }

    private func statTile(_ value: String, _ label: String) -> some View {
        VStack(alignment: .leading) {
            Text(value)
                .font(.headline)
                .monospacedDigit()
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private func stayRow(_ spot: Spot) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(spot.name)
                .font(.headline)
            Text(stayLabel(spot))
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }

    private func stayLabel(_ spot: Spot) -> String {
        guard let departedAt = spot.departedAt else {
            return "\(Formatters.clock(spot.arrivedAt)) –"
        }
        return "\(Formatters.clock(spot.arrivedAt)) – \(Formatters.clock(departedAt))(\(Formatters.duration(departedAt.timeIntervalSince(spot.arrivedAt))))"
    }

    private func focus(on spot: Spot) {
        withAnimation {
            mapCamera = .region(MKCoordinateRegion(
                center: CLLocationCoordinate2D(latitude: spot.lat, longitude: spot.lng),
                latitudinalMeters: 600,
                longitudinalMeters: 600
            ))
        }
    }

    // MARK: - 写真 (V-07)

    private var photoGrid: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 96), spacing: 8)], spacing: 8) {
            ForEach(photos) { photo in
                PhotoThumbnail(photo: photo)
                    .onTapGesture { viewingPhoto = photo }
                    .contextMenu {
                        Button("この写真を削除", systemImage: "trash", role: .destructive) {
                            context.delete(photo)
                            try? context.save()
                        }
                    }
            }
        }
    }

    private func addPhotos(_ items: [PhotosPickerItem]) {
        guard !items.isEmpty else { return }
        Task {
            for item in items {
                guard let data = try? await item.loadTransferable(type: Data.self),
                      let jpeg = Self.downscaledJPEG(data) else { continue }
                context.insert(TripPhoto(tripId: trip.id, imageData: jpeg))
            }
            try? context.save()
            pickerItems = []
        }
    }

    /// 保存サイズを抑えるため長辺2048pxに縮小してJPEG化(端末内保存のみ)
    private static func downscaledJPEG(_ data: Data, maxDimension: CGFloat = 2048) -> Data? {
        guard let image = UIImage(data: data) else { return nil }
        let longest = max(image.size.width, image.size.height)
        guard longest > maxDimension else { return image.jpegData(compressionQuality: 0.85) }
        let scale = maxDimension / longest
        let newSize = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let resized = UIGraphicsImageRenderer(size: newSize).image { _ in
            image.draw(in: CGRect(origin: .zero, size: newSize))
        }
        return resized.jpegData(compressionQuality: 0.85)
    }

    // MARK: - アーカイブ (D-03)

    private func toggleArchive() {
        if trip.archivedAt == nil {
            trip.archivedAt = Date()
            try? context.save()
            dismiss()
        } else {
            trip.archivedAt = nil
            try? context.save()
        }
    }
}

struct PhotoThumbnail: View {
    let photo: TripPhoto

    var body: some View {
        Color.clear
            .aspectRatio(1, contentMode: .fit)
            .overlay {
                if let image = UIImage(data: photo.imageData) {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .contentShape(RoundedRectangle(cornerRadius: 12))
            .accessibilityLabel("旅の写真")
    }
}

struct PhotoViewerSheet: View {
    let photo: TripPhoto
    var onDelete: () -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Group {
                if let image = UIImage(data: photo.imageData) {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFit()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            .background(.black)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("削除", systemImage: "trash", role: .destructive) {
                        onDelete()
                        dismiss()
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("閉じる") { dismiss() }
                }
            }
        }
    }
}

struct SpotEditSheet: View {
    @Bindable var spot: Spot
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("名前") {
                    TextField("スポット名", text: $spot.name)
                        .onChange(of: spot.name) {
                            spot.nameSource = .manual
                        }
                }
                Section("メモ") {
                    TextField("メモ", text: $spot.note, axis: .vertical)
                        .lineLimit(3...6)
                }
                Section {
                    Button("このスポットを削除", role: .destructive) {
                        context.delete(spot)
                        try? context.save()
                        dismiss()
                    }
                }
            }
            .navigationTitle("スポットを編集")
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

struct TripEditSheet: View {
    @Bindable var trip: Trip
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("タイトル") {
                    TextField("旅のタイトル", text: $trip.title)
                }
                Section("メモ") {
                    TextField("メモ", text: $trip.note, axis: .vertical)
                        .lineLimit(3...6)
                }
            }
            .navigationTitle("旅を編集")
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
