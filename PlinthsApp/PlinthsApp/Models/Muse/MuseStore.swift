import Foundation
import Observation

/// In-memory per-session thread store, keyed by reportKey. Durable (across-launch)
/// persistence is deferred to M7 with the real backend.
@Observable
final class MuseStore {
    private var threads: [String: [MuseTurn]] = [:]

    func thread(for reportKey: String) -> [MuseTurn] { threads[reportKey] ?? [] }
    func hasThread(for reportKey: String) -> Bool { !(threads[reportKey] ?? []).isEmpty }

    func append(_ turn: MuseTurn, for reportKey: String) {
        threads[reportKey, default: []].append(turn)
    }

    func setFeedback(_ value: MuseFeedbackValue, turnID: String, reportKey: String) {
        guard var t = threads[reportKey], let idx = t.firstIndex(where: { $0.id == turnID }) else { return }
        t[idx].feedback = value
        threads[reportKey] = t
    }
}
