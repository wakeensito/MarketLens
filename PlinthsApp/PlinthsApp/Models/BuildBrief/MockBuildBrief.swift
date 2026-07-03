import Foundation

/// Canned per-report Build Briefs (no live generation until M7). Keyed by the
/// same reportKey as MockMemo / MockMuse.
enum MockBuildBrief {

    static func brief(for reportKey: String) -> BuildBrief {
        switch reportKey {
        case "crowded": creatorEconomy
        case "open":    construction
        default:        digitalFitness
        }
    }

    // MARK: digitalFitness — verbatim port of web MOCK_BUILD_BRIEF
    static let digitalFitness = BuildBrief(
        isTechDominant: true,
        complexityScore: 58, complexityLabel: "Moderate",
        complexityDrivers: ["real-time adaptive logic", "wearable & biometric integrations", "a model that improves per user"],
        capabilities: [
            BuildBriefCapability(name: "Accounts & sign-in",
                description: "Let people create an account and sign in securely across devices.",
                buildOrBuy: .buy, recommendation: "Use a managed identity provider (Auth0, Cognito, or Clerk). Do not roll your own."),
            BuildBriefCapability(name: "Payments & subscriptions",
                description: "Charge for a monthly plan and manage upgrades, cancellations, and refunds.",
                buildOrBuy: .buy, recommendation: "Stripe handles billing, tax, and the customer portal — don’t build this."),
            BuildBriefCapability(name: "Wearable & health-data sync",
                description: "Pull heart rate, sleep, and activity from watches and phones.",
                buildOrBuy: .build, recommendation: "Thin integration layer over HealthKit / vendor APIs; the normalization is yours."),
            BuildBriefCapability(name: "Adaptive coaching engine",
                description: "Adjust each workout in real time from the person’s data and history.",
                buildOrBuy: .build, recommendation: "This is your differentiator — own it end to end."),
            BuildBriefCapability(name: "Notifications",
                description: "Nudge people to work out and celebrate progress.",
                buildOrBuy: .buy, recommendation: "A managed push service (OneSignal, or the platform APIs) is plenty."),
            BuildBriefCapability(name: "Outcome & retention analytics",
                description: "See who sticks around, who drops off, and why.",
                buildOrBuy: .buy, recommendation: "Off-the-shelf product analytics; instrument the retention loop first."),
        ],
        foundation: [
            BuildBriefPrimitive(primitive: "Object storage", why: "Store media, exports, and model artifacts cheaply.",
                cloudExamples: "S3 (AWS) / Blob Storage (Azure) / Cloud Storage (GCP)"),
            BuildBriefPrimitive(primitive: "Managed database", why: "Your source of truth for users, plans, and history.",
                cloudExamples: "RDS (AWS) / Azure SQL / Cloud SQL (GCP)"),
            BuildBriefPrimitive(primitive: "Serverless compute", why: "Run the adaptive logic without managing servers.",
                cloudExamples: "Lambda (AWS) / Functions (Azure) / Cloud Functions (GCP)"),
            BuildBriefPrimitive(primitive: "CDN", why: "Serve the app and media fast, everywhere.",
                cloudExamples: "CloudFront (AWS) / Front Door (Azure) / Cloud CDN (GCP)"),
            BuildBriefPrimitive(primitive: "Lightweight data pipeline", why: "Move wearable data in and analytics out.",
                cloudExamples: "EventBridge + Kinesis (AWS) / Event Grid (Azure) / Pub/Sub (GCP)"),
        ],
        mvpScope: "To stand up a localhost MVP: a sign-in screen, a profile, a workout that adapts from one manual input (like “I’m tired today”), and a way to log that it happened. Skip wearables, payments, and the learning model until you have proven people come back.",
        effort: BuildBriefEffort(timeframe: "8 to 14 weeks to a usable MVP", teamShape: "1 to 2 engineers, plus a part-time designer"),
        technicalRisks: [
            BuildBriefRisk(title: "Retention is the real product", description: "If people don’t come back in week 4, nothing else matters — instrument it from day one."),
            BuildBriefRisk(title: "Health data is sensitive", description: "Heart rate and sleep carry privacy obligations; handle, store, and delete it carefully."),
            BuildBriefRisk(title: "Wearable integrations drift", description: "Device APIs change and break; budget ongoing maintenance, not a one-time build."),
        ])

    // MARK: crowded — creator-economy monetization
    static let creatorEconomy = BuildBrief(
        isTechDominant: true,
        complexityScore: 66, complexityLabel: "High",
        complexityDrivers: ["money movement & payouts", "fraud and compliance", "multi-party accounting"],
        capabilities: [
            BuildBriefCapability(name: "Creator & fan accounts",
                description: "Two account types with different permissions and dashboards.",
                buildOrBuy: .buy, recommendation: "Managed identity with roles; don’t build auth."),
            BuildBriefCapability(name: "Payments, payouts & escrow",
                description: "Take money from fans, hold it, and pay creators — correctly, on time.",
                buildOrBuy: .buy, recommendation: "Stripe Connect is built for exactly this; fair payouts is your product, not the rails."),
            BuildBriefCapability(name: "Fair-payout logic",
                description: "Faster, more transparent payouts than the incumbents’ long holds.",
                buildOrBuy: .build, recommendation: "This is the wedge — own the payout timing and transparency."),
            BuildBriefCapability(name: "Fraud & chargeback handling",
                description: "Catch bad actors before they cost creators money.",
                buildOrBuy: .buy, recommendation: "Use the processor’s fraud tools first; tune, don’t build."),
        ],
        foundation: [
            BuildBriefPrimitive(primitive: "Managed database", why: "Ledger-grade record of every transaction.",
                cloudExamples: "RDS (AWS) / Azure SQL / Cloud SQL (GCP)"),
            BuildBriefPrimitive(primitive: "Queue / workflow", why: "Payout jobs must be reliable and retryable.",
                cloudExamples: "SQS + Step Functions (AWS) / Service Bus (Azure) / Cloud Tasks (GCP)"),
            BuildBriefPrimitive(primitive: "Object storage", why: "Store creator content and payout records.",
                cloudExamples: "S3 (AWS) / Blob Storage (Azure) / Cloud Storage (GCP)"),
            BuildBriefPrimitive(primitive: "Serverless compute", why: "Run payout and webhook handlers on demand.",
                cloudExamples: "Lambda (AWS) / Functions (Azure) / Cloud Functions (GCP)"),
        ],
        mvpScope: "Pick one niche and prove fair payouts: creator sign-up, a fan checkout, and a payout that lands faster and clearer than Patreon. Skip discovery, messaging, and analytics until creators trust you with their money.",
        effort: BuildBriefEffort(timeframe: "12 to 20 weeks to a trustworthy MVP", teamShape: "2 engineers with payments experience, plus a designer"),
        technicalRisks: [
            BuildBriefRisk(title: "Money movement is unforgiving", description: "A payout bug erodes trust instantly; correctness beats features here."),
            BuildBriefRisk(title: "Compliance scales with volume", description: "KYC, tax, and regional rules grow as you do — design for them early."),
            BuildBriefRisk(title: "Incumbents can copy fast", description: "Fair payouts is a wedge, not a moat; keep earning the niche’s loyalty."),
        ])

    // MARK: open — construction project management
    static let construction = BuildBrief(
        isTechDominant: true,
        complexityScore: 44, complexityLabel: "Moderate",
        complexityDrivers: ["offline-first mobile", "role-based jobsite workflows", "slow, referral-driven sales"],
        capabilities: [
            BuildBriefCapability(name: "Accounts & crews",
                description: "Owners, foremen, and crew with the right access on the jobsite.",
                buildOrBuy: .buy, recommendation: "Managed identity with simple roles."),
            BuildBriefCapability(name: "Offline-first mobile app",
                description: "Works with no signal on site, syncs when it’s back.",
                buildOrBuy: .build, recommendation: "This is the differentiator small crews actually need — own the sync."),
            BuildBriefCapability(name: "Scheduling & coordination",
                description: "Who’s where, what’s next, two-tap simple.",
                buildOrBuy: .build, recommendation: "Keep it lighter than the enterprise tools; that simplicity is the product."),
            BuildBriefCapability(name: "Notifications & reminders",
                description: "Nudge the crew about today’s plan and changes.",
                buildOrBuy: .buy, recommendation: "Platform push APIs are enough."),
        ],
        foundation: [
            BuildBriefPrimitive(primitive: "Managed database", why: "Source of truth for jobs, schedules, and crews.",
                cloudExamples: "RDS (AWS) / Azure SQL / Cloud SQL (GCP)"),
            BuildBriefPrimitive(primitive: "Sync / offline store", why: "The offline-first experience depends on solid sync.",
                cloudExamples: "AppSync (AWS) / Cosmos DB (Azure) / Firestore (GCP)"),
            BuildBriefPrimitive(primitive: "Object storage", why: "Store jobsite photos and documents.",
                cloudExamples: "S3 (AWS) / Blob Storage (Azure) / Cloud Storage (GCP)"),
            BuildBriefPrimitive(primitive: "Serverless compute", why: "Run coordination logic without ops overhead.",
                cloudExamples: "Lambda (AWS) / Functions (Azure) / Cloud Functions (GCP)"),
        ],
        mvpScope: "Win one trade: a mobile schedule a foreman can update offline, a job list, and a change that reaches the crew. Skip billing, documents, and reporting until one trade relies on it daily.",
        effort: BuildBriefEffort(timeframe: "10 to 16 weeks to a jobsite-ready MVP", teamShape: "1 to 2 engineers comfortable with mobile + sync, plus a designer"),
        technicalRisks: [
            BuildBriefRisk(title: "Offline sync is deceptively hard", description: "Conflict resolution on flaky connections is where these apps live or die."),
            BuildBriefRisk(title: "Adoption is a field problem", description: "If the foreman won’t use it in gloves, nothing else matters — design for the site."),
            BuildBriefRisk(title: "Sales is slow and offline", description: "Referral-driven; the build is easy, earning trust in a trade is the work."),
        ])

    // MARK: low-tech branch (preview only — no report idea triggers it)
    static let lowTechExample = BuildBrief(
        isTechDominant: false,
        complexityScore: 0, complexityLabel: "", complexityDrivers: [],
        capabilities: [], foundation: [], mvpScope: "",
        effort: BuildBriefEffort(timeframe: "", teamShape: ""), technicalRisks: [])
}
