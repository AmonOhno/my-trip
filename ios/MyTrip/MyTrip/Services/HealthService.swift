import Foundation
import HealthKit

/// HealthKitから旅の期間の歩数を読み取る(読み取り専用・端末内利用のみ)。
final class HealthService {
    static let shared = HealthService()

    private let store = HKHealthStore()

    private init() {}

    /// 歩数の期間合計。利用不可・未許可・データなしは nil
    func fetchSteps(from start: Date, to end: Date) async -> Int? {
        guard HKHealthStore.isHealthDataAvailable() else { return nil }
        let stepType = HKQuantityType(.stepCount)

        do {
            try await store.requestAuthorization(toShare: [], read: [stepType])
        } catch {
            return nil
        }

        return await withCheckedContinuation { continuation in
            let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
            let query = HKStatisticsQuery(
                quantityType: stepType,
                quantitySamplePredicate: predicate,
                options: .cumulativeSum
            ) { _, statistics, _ in
                let sum = statistics?.sumQuantity()?.doubleValue(for: .count())
                continuation.resume(returning: sum.map { Int($0) })
            }
            store.execute(query)
        }
    }
}
