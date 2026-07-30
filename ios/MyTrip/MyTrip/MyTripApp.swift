import SwiftData
import SwiftUI

@main
struct MyTripApp: App {
    private let container: ModelContainer
    @StateObject private var recorder = TripRecorder()

    init() {
        // APIキーがある場合のみGoogleマップで描画する(無ければMapKit)
        GoogleMapsConfig.start()
        do {
            container = try ModelContainer(for: Trip.self, TripPoint.self, Spot.self, TripPhoto.self, TripPlan.self, PlanItem.self)
        } catch {
            fatalError("SwiftDataの初期化に失敗しました: \(error)")
        }
    }

    var body: some Scene {
        WindowGroup {
            HomeView()
                .environmentObject(recorder)
                .onAppear {
                    recorder.configure(context: container.mainContext)
                }
        }
        .modelContainer(container)
    }
}
