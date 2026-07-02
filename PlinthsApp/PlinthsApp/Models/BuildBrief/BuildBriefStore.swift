import Foundation
import Observation

enum BuildBriefState: Equatable { case idle, generating, ready }

/// In-memory per-session generate state, keyed by reportKey. Real generation +
/// persistence land in M7.
@Observable
final class BuildBriefStore {
    private var states: [String: BuildBriefState] = [:]

    func state(for key: String) -> BuildBriefState { states[key] ?? .idle }
    func startGenerating(_ key: String) { states[key] = .generating }
    func markReady(_ key: String) { states[key] = .ready }
}
