import SwiftData
import SwiftUI
import UniformTypeIdentifiers

struct SettingsView: View {
    @Environment(\.modelContext) private var context
    @State private var exportURL: URL?
    @State private var showImporter = false
    @State private var showDeleteConfirm = false
    @State private var message: String?

    var body: some View {
        List {
            Section {
                Button {
                    exportURL = try? ExportService.export(context: context)
                } label: {
                    Label("エクスポート (JSON)", systemImage: "square.and.arrow.up")
                }
                Button {
                    showImporter = true
                } label: {
                    Label("インポート", systemImage: "square.and.arrow.down")
                }
            } header: {
                Text("データ")
            } footer: {
                Text("すべての記録はこの端末内にのみ保存されます。バックアップや機種変更にはエクスポートをご利用ください(Web版と共通形式)。")
            }

            Section {
                Button("すべてのデータを削除", role: .destructive) {
                    showDeleteConfirm = true
                }
            } footer: {
                if let message {
                    Text(message)
                }
            }
        }
        .navigationTitle("設定")
        .sheet(item: $exportURL) { url in
            ShareSheet(url: url)
        }
        .fileImporter(isPresented: $showImporter, allowedContentTypes: [.json]) { result in
            guard case .success(let url) = result else { return }
            do {
                let accessed = url.startAccessingSecurityScopedResource()
                defer { if accessed { url.stopAccessingSecurityScopedResource() } }
                let count = try ExportService.importData(try Data(contentsOf: url), context: context)
                message = "\(count)件の旅を取り込みました。"
            } catch {
                message = "インポートに失敗しました: \(error.localizedDescription)"
            }
        }
        .confirmationDialog("すべて削除しますか?", isPresented: $showDeleteConfirm, titleVisibility: .visible) {
            Button("削除する", role: .destructive) {
                try? context.delete(model: TripPoint.self)
                try? context.delete(model: Spot.self)
                try? context.delete(model: Trip.self)
                try? context.save()
                message = "すべてのデータを削除しました。"
            }
            Button("キャンセル", role: .cancel) {}
        } message: {
            Text("全旅の記録が完全に削除されます。必要ならエクスポートを先に行ってください。")
        }
    }
}

extension URL: Identifiable {
    public var id: String { absoluteString }
}

private struct ShareSheet: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [url], applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
