import SwiftUI

/// 旅の写真サムネイル一覧 (V-07)。旅詳細と記録中画面で共用する。
struct TripPhotoGrid: View {
    let photos: [TripPhoto]
    var onTap: (TripPhoto) -> Void
    var onDelete: (TripPhoto) -> Void

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 96), spacing: 8)], spacing: 8) {
            ForEach(photos) { photo in
                PhotoThumbnail(photo: photo)
                    .onTapGesture { onTap(photo) }
                    .contextMenu {
                        Button("この写真を削除", systemImage: "trash", role: .destructive) {
                            onDelete(photo)
                        }
                    }
            }
        }
    }
}
