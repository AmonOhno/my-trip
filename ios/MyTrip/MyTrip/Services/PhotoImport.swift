import PhotosUI
import SwiftData
import SwiftUI
import UIKit

/// フォトライブラリで選んだ画像を TripPhoto として保存する共通処理 (V-07 / F-11)。
/// 旅詳細と記録中画面で共用する。写真は端末内(SwiftData外部ストレージ)にのみ保存し、
/// エクスポートJSONには含めない(ローカルファースト・v1スキーマ不変)。
enum PhotoImport {
    /// 保存サイズを抑えるため長辺2048pxに縮小してJPEG化(端末内保存のみ)
    static func downscaledJPEG(_ data: Data, maxDimension: CGFloat = 2048) -> Data? {
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

    @MainActor
    static func save(_ items: [PhotosPickerItem], tripId: UUID, context: ModelContext) async {
        for item in items {
            guard let data = try? await item.loadTransferable(type: Data.self),
                  let jpeg = downscaledJPEG(data) else { continue }
            context.insert(TripPhoto(tripId: tripId, imageData: jpeg))
        }
        try? context.save()
    }
}
