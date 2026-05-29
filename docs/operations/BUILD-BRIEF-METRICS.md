# Build Brief — checking usage metrics

`BuildBriefFunction` emits CloudWatch metrics (Powertools EMF). No pipeline, no Athena — just the CloudWatch console.

**Namespace:** `MarketLens` · **dimensions:** `service=build-brief`, `plan` (`pro`/`max`/`admin`)

| Metric | Meaning |
|---|---|
| `BuildBriefGenerated` | a brief was generated + stored (one per first-time generation) |
| `BuildBriefFailed` | generation failed (model/parse error → 502) |
| *Invocations / Errors / Duration* | free Lambda baseline (total requests incl. cached re-opens, crashes, latency) |

## See usage by plan (console)

1. CloudWatch → **Metrics** → **All metrics**.
2. Custom namespace **`MarketLens`** → **service, plan**.
3. Tick `BuildBriefGenerated` for each `plan` you want. Set **Statistic = Sum**, period **1 day** (Graphed metrics tab).
4. Add `BuildBriefFailed` the same way → failure rate = Failed ÷ (Generated + Failed).

## See latency / total request volume

CloudWatch → Metrics → **Lambda → By Function Name** → `marketlens-dev-BuildBriefFunction-*` → `Invocations` (Sum) and `Duration` (Average/p95).

## Low-tech vs tech-dominant split (Logs Insights)

`tech_dominant` rides as EMF metadata, not a metric. To split it:

1. CloudWatch → **Logs Insights** → log group `/aws/lambda/marketlens-dev-BuildBriefFunction-*`.
2. Run:
   ```
   fields tech_dominant
   | filter ispresent(tech_dominant)
   | stats count(*) by tech_dominant
   ```

## Optional: quick alarm on failures

CloudWatch → Alarms → Create → namespace `MarketLens` → `BuildBriefFailed` (Sum, 1h) → threshold e.g. `> 5` → SNS notify. Catches a broken model/prompt before users report it.
