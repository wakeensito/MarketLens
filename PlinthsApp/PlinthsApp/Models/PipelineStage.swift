import Foundation

/// One stage of the (mock) analysis pipeline shown on the loading screen.
/// Mirrors the web app's PIPELINE_STAGE_DEFS (frontend/src/mockData.ts), with
/// the three parallel web-research stages collapsed into one and the total
/// compressed to ~6.5s for a snappier feel.
struct PipelineStage: Identifiable {
    let id: String
    let label: String
    let description: String
    let startMs: Int
    let durationMs: Int

    static let all: [PipelineStage] = [
        PipelineStage(id: "validate", label: "Validating",
                      description: "Sanitizing input", startMs: 0, durationMs: 300),
        PipelineStage(id: "parse", label: "Parsing concept",
                      description: "Extracting vertical, keywords & intent", startMs: 300, durationMs: 900),
        PipelineStage(id: "research", label: "Web Research",
                      description: "Mapping competitors, market size & trends", startMs: 1200, durationMs: 2200),
        PipelineStage(id: "analyse", label: "Analysing landscape",
                      description: "Competitive positioning & moats", startMs: 3400, durationMs: 1600),
        PipelineStage(id: "score", label: "Scoring",
                      description: "Saturation & opportunity index", startMs: 5000, durationMs: 400),
        PipelineStage(id: "synthesise", label: "Synthesising insights",
                      description: "Summary, gaps & entry roadmap", startMs: 5400, durationMs: 900),
        PipelineStage(id: "assemble", label: "Assembling report",
                      description: "Packaging the final report", startMs: 6300, durationMs: 400),
    ]

    /// Total runtime in seconds (end of the last stage).
    static let totalSeconds: Double = {
        let endMs = all.map { $0.startMs + $0.durationMs }.max() ?? 0
        return Double(endMs) / 1000.0
    }()

    /// The stage active at the given elapsed time (seconds), clamped to the last.
    static func stage(at elapsed: Double) -> PipelineStage {
        let ms = Int(elapsed * 1000)
        return all.last(where: { ms >= $0.startMs }) ?? all[0]
    }
}
