# Muse Analytics Pipeline — Chat Data → Parquet on S3 → Athena

> **Audience:** anyone touching chat-side analytics, schema, or operational alarms for the Muse pipeline.
> **Status:** infrastructure scaffolded in `template.yaml`. End-to-end smoke test pending first `sam deploy`.

## 1. Why this exists

The **report pipeline** writes finished analyses as raw JSON to `marketlens-reports-raw-${Stage}` and converts them to Parquet via DataBrew. That works because reports are large, infrequent, and have a messy nested schema worth a curated ETL recipe.

**Chat data is different.** Each Muse turn is one small, well-shaped row: `role`, `content`, `tokens_in/out`, `sources`, etc. Volume will quickly outgrow report volume, the schema is stable, and we want it queryable in Athena without spinning up DataBrew for every batch.

So Muse chat takes a different path: **Firehose's built-in JSON → Parquet conversion** lands the data directly as Parquet in a dedicated bucket. No DataBrew step, no ETL job to babysit.

## 2. Architecture

```
┌──────────────────────┐
│  Muse Stream Lambda  │  (writes one user+assistant pair per turn)
└──────────┬───────────┘
           │ write_pair → DynamoDB
           ▼
┌──────────────────────────────┐
│  MuseConversationsTable      │  (StreamSpecification: NEW_IMAGE)
└──────────┬───────────────────┘
           │ DynamoDB Streams (INSERTs)
           ▼
┌──────────────────────────────┐         on-failure (after 3 retries)
│  MuseForwarderFunction       │ ─────────────────────────────────────► SQS DLQ
│  - unwraps AttributeValue    │
│  - projects to schema        │
│  - PutRecordBatch → Firehose │
└──────────┬───────────────────┘
           │ JSON records
           ▼
┌──────────────────────────────────────────────┐
│  MuseAnalyticsFirehose (DirectPut)           │
│  - buffers 60s / 64MiB                       │
│  - looks up schema from Glue table           │
│  - converts JSON → Parquet (SNAPPY)          │
│  - writes to s3://…/muse/raw/dt=YYYY-MM-DD/  │
└──────────┬───────────────────────────────────┘
           │ Parquet objects
           ▼
┌──────────────────────────────┐
│  MuseAnalyticsBucket (S3)    │  prefixes: muse/raw/dt=… and muse/errors/…
└──────────┬───────────────────┘
           │ partition projection (Glue table)
           ▼
┌──────────────────────────────┐
│  Athena — plinths_muse_${Stage}.muse_messages │
└──────────────────────────────┘
```

## 3. Resource inventory

All resources live in `template.yaml`. Names use the standard `${Stage}` substitution.

| Resource | Logical ID | Physical name | Where |
|---|---|---|---|
| Source table | `MuseConversationsTable` | `marketlens-muse-conversations-${Stage}` | `template.yaml:489` (StreamSpecification at `:529`) |
| S3 bucket | `MuseAnalyticsBucket` | `marketlens-muse-raw-${Stage}-${AWS::AccountId}` | `template.yaml:538` |
| DLQ | `MuseForwarderDLQ` | `plinths-muse-forwarder-dlq-${Stage}` | `template.yaml:566` |
| Glue database | `MuseAnalyticsGlueDatabase` | `plinths_muse_${Stage}` | `template.yaml:576` |
| Glue table | `MuseAnalyticsGlueTable` | `muse_messages` | `template.yaml:584` |
| Firehose role | `MuseAnalyticsFirehoseRole` | `plinths-muse-firehose-${Stage}` | `template.yaml:642` |
| Firehose stream | `MuseAnalyticsFirehose` | `plinths-muse-${Stage}` | `template.yaml:699` |
| Forwarder Lambda | `MuseForwarderFunction` | `${StackName}-MuseForwarderFunction-…` | `template.yaml:739` |
| Forwarder code | — | — | `infrastructure/lambda/muse-forwarder/app.py` |

Stack outputs surface bucket / Firehose / Glue / DLQ names — `aws cloudformation describe-stacks --stack-name <stack> --query "Stacks[0].Outputs"`.

## 4. Schema

Each Muse turn becomes one row in `muse_messages`. The forwarder (`app.py:_project_row`) is the canonical projection — keep it in sync with the Glue table when adding columns.

| Parquet column | Type | Source DDB attribute | Notes |
|---|---|---|---|
| `report_id` | string | `pk` (`REPORT#…` prefix stripped) | partition-style key, but the actual Athena partition is `dt` |
| `org_id` | string | `gsi1pk` (`ORG#…` prefix stripped) | tenancy filter |
| `conversation_id` | string | `conversation_id` | groups turns into a thread |
| `message_id` | string | `message_id` | unique per row |
| `role` | string | `role` | `"user"` or `"assistant"` |
| `content` | string | `content` | raw user prompt or assistant prose (citations inline as `[[target\|Label]]`) |
| `created_at` | string | `created_at` | ISO-8601; CAST in queries when needed |
| `sources` | `array<struct<kind,target,label:string>>` | `sources` (assistant only; `[]` for user rows) | citation pills emitted by the model |
| `follow_ups` | `array<string>` | `follow_ups` (assistant only; `[]` for user rows) | suggested questions shown in the UI |
| `tokens_in` | bigint | `tokens_in` (0 for user rows) | input tokens charged to Bedrock |
| `tokens_out` | bigint | `tokens_out` (0 for user rows) | output tokens charged to Bedrock |
| `model_id` | string | `model_id` (`""` for user rows) | which Bedrock model produced the assistant turn |

**Partition key (not a column):** `dt` (string, format `yyyy-MM-dd`) — assigned by Firehose's `!{timestamp:yyyy-MM-dd}` prefix expression at write time. Athena uses **partition projection** (declared on the Glue table at `template.yaml:594-606`), so new days appear automatically — no `MSCK REPAIR` ever required.

**Things deliberately not in the schema:** `pk`, `sk`, `gsi1sk`, `ttl`. They're operational, not analytical.

## 5. Operational runbook

### Verify after first deploy

After `sam deploy`:

```bash
STAGE=dev
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
BUCKET="marketlens-muse-raw-${STAGE}-${ACCOUNT}"
TABLE="marketlens-muse-conversations-${STAGE}"

# 1. Confirm the table now has a stream.
aws dynamodb describe-table --table-name "$TABLE" \
  --query 'Table.StreamSpecification'

# 2. Confirm the Firehose stream is ACTIVE.
aws firehose describe-delivery-stream \
  --delivery-stream-name "plinths-muse-${STAGE}" \
  --query 'DeliveryStreamDescription.DeliveryStreamStatus'

# 3. Drop one synthetic row in the table and wait 90s for the Firehose buffer.
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
aws dynamodb put-item --table-name "$TABLE" --item "{
  \"pk\":              {\"S\":\"REPORT#smoke-test\"},
  \"sk\":              {\"S\":\"MSG#${NOW}#smoke\"},
  \"gsi1pk\":          {\"S\":\"ORG#smoke-test\"},
  \"gsi1sk\":          {\"S\":\"${NOW}#smoke-test\"},
  \"conversation_id\": {\"S\":\"smoke\"},
  \"message_id\":      {\"S\":\"smoke\"},
  \"role\":            {\"S\":\"user\"},
  \"content\":         {\"S\":\"pipeline smoke test\"},
  \"created_at\":      {\"S\":\"${NOW}\"}
}"

sleep 90

# 4. List the day's prefix — a Parquet object should appear.
aws s3 ls "s3://${BUCKET}/muse/raw/dt=$(date -u +%Y-%m-%d)/" --recursive
```

If the bucket is empty after 90s, check:
- Forwarder logs: `aws logs tail /aws/lambda/<forwarder-name> --follow`
- Firehose delivery logs: `/aws/kinesisfirehose/plinths-muse-${STAGE}`
- DLQ depth: `aws sqs get-queue-attributes --queue-url <dlq> --attribute-names ApproximateNumberOfMessages`

### When the DLQ alarm fires

The recommended alarm: **`ApproximateNumberOfMessagesVisible > 0`** on `MuseForwarderDLQ`. First message means the forwarder Lambda failed an entire batch after retries.

The DLQ contains **failure metadata, not the failed records themselves** — the originals stay in DynamoDB Streams for 24h max. Procedure:

1. **Read the failure record:**
   ```bash
   aws sqs receive-message --queue-url <dlq-url> \
     --max-number-of-messages 10 --wait-time-seconds 5
   ```
   Each message includes the stream ARN, shard ID, and sequence number range of the failed batch, plus the error.

2. **Find the offending records:** if you're inside the 24h DDB Streams window, you can re-read the batch directly:
   ```bash
   aws dynamodbstreams get-shard-iterator \
     --stream-arn <stream-arn> --shard-id <shard-id> \
     --shard-iterator-type AT_SEQUENCE_NUMBER \
     --sequence-number <starting-sequence>
   ```
   then `get-records` to inspect.

3. **Fix and replay:**
   - **Schema mismatch (most common):** the row had a column type Firehose's Parquet converter rejected. Update the Glue table columns to match, then re-deploy. Replay by re-putting the original row into the conversations table (it'll re-stream).
   - **Forwarder bug:** fix the Lambda code, deploy, and either replay the records as above or accept the loss (chat analytics tolerates missing rows).

4. **Drain the DLQ** after fix:
   ```bash
   aws sqs purge-queue --queue-url <dlq-url>
   ```

### Adding a column

1. **Decide source.** Is the new column already in DDB rows, or does the forwarder need to compute it?
2. **Update the Glue table** in `template.yaml` (the `Columns:` list at `:610`). Firehose picks up `LATEST` schema on every batch, so a redeploy is enough — no Athena restart needed.
3. **If the value isn't in DDB rows:** update `_project_row` in `infrastructure/lambda/muse-forwarder/app.py` to compute and emit it. Backfill is not automatic — old Parquet files won't gain the column. Athena will report `NULL` for partitions written before the change.
4. **Validate** by running an Athena query that selects the new column and ensuring no errors.

### Costs and retention

| Cost item | Estimate |
|---|---|
| DynamoDB Streams reads | Free at our scale (within the per-second read limit for STREAMS) |
| Forwarder Lambda invocations | ~$0 — well under the 1M free-tier monthly invocations |
| Firehose ingestion | $0.029 / GB ingested |
| Firehose Parquet conversion | $0.018 / GB converted |
| S3 storage (Parquet, SNAPPY-compressed) | $0.023 / GB / month |
| Athena queries | $5 / TB scanned — partition pruning on `dt` keeps individual queries cheap |

**Retention** (`MuseAnalyticsBucket` lifecycle rules, `template.yaml:558-571`):
- `muse/raw/` Parquet — **365 days** then expire. Override if compliance requires longer.
- `muse/errors/` Firehose error records — **90 days**.

## 6. Athena queries

### One-time setup

In the Athena console (or via API), set the workgroup query result location to an S3 path you control. Then point Athena at the database:

```sql
-- Replace 'dev' with your stage.
USE plinths_muse_dev;
SHOW TABLES;
-- Should list: muse_messages
DESCRIBE muse_messages;
```

All queries below assume you've selected the database. **Always include a `dt` filter** — without one, Athena scans every partition (full table scan) and the bill matches.

---

### Q1. Daily message volume by role

Engagement trend; user-to-assistant ratio sanity check.

```sql
SELECT
  dt,
  role,
  COUNT(*) AS messages
FROM muse_messages
WHERE dt >= date_format(current_date - interval '30' day, '%Y-%m-%d')
GROUP BY dt, role
ORDER BY dt DESC, role;
```

### Q2. Token-count distribution per assistant turn (p50 / p95)

Cost forecasting and a check on whether the model is producing reasonably-sized responses.

```sql
SELECT
  approx_percentile(tokens_in,  0.50) AS p50_tokens_in,
  approx_percentile(tokens_in,  0.95) AS p95_tokens_in,
  approx_percentile(tokens_out, 0.50) AS p50_tokens_out,
  approx_percentile(tokens_out, 0.95) AS p95_tokens_out,
  COUNT(*) AS assistant_turns
FROM muse_messages
WHERE role = 'assistant'
  AND dt >= date_format(current_date - interval '7' day, '%Y-%m-%d');
```

### Q3. Top 10 most-chatted reports

Which reports are driving Muse engagement — useful product signal.

```sql
SELECT
  report_id,
  COUNT(*) AS messages,
  COUNT(DISTINCT conversation_id) AS conversations
FROM muse_messages
WHERE dt >= date_format(current_date - interval '30' day, '%Y-%m-%d')
GROUP BY report_id
ORDER BY messages DESC
LIMIT 10;
```

### Q4. Conversation length distribution

Are people having real conversations or one-shot questions?

```sql
WITH lengths AS (
  SELECT conversation_id, COUNT(*) AS turns
  FROM muse_messages
  WHERE dt >= date_format(current_date - interval '30' day, '%Y-%m-%d')
  GROUP BY conversation_id
)
SELECT
  CASE
    WHEN turns <= 2  THEN '01_one_turn'
    WHEN turns <= 6  THEN '02_short'
    WHEN turns <= 14 THEN '03_medium'
    ELSE                  '04_deep'
  END AS bucket,
  COUNT(*) AS conversations
FROM lengths
GROUP BY 1
ORDER BY 1;
```

### Q5. Citation usage

Is the model actually grounding responses in report data?

```sql
SELECT
  COUNT(*) AS assistant_turns,
  AVG(cardinality(sources)) AS avg_citations_per_turn,
  SUM(CASE WHEN cardinality(sources) = 0 THEN 1 ELSE 0 END) AS uncited_turns,
  CAST(
    SUM(CASE WHEN cardinality(sources) = 0 THEN 1 ELSE 0 END) AS double
  ) / COUNT(*) AS uncited_share
FROM muse_messages
WHERE role = 'assistant'
  AND dt >= date_format(current_date - interval '7' day, '%Y-%m-%d');
```

### Q6. Cost per conversation

Real per-tier unit economics. **Update the price constants** when AWS publishes Nova 2 Lite pricing or when you add other models.

```sql
-- Per-million-token pricing. Maintain alongside docs/BEDROCK-MODEL-CONFIG.md.
WITH prices AS (
  SELECT
    'amazon.nova-2-lite-v1:0' AS model_id,
    0.06 AS input_per_million,
    0.24 AS output_per_million
),
per_conversation AS (
  SELECT
    m.conversation_id,
    SUM(m.tokens_in)  AS total_tokens_in,
    SUM(m.tokens_out) AS total_tokens_out,
    SUM(
      m.tokens_in  * p.input_per_million  / 1000000.0
    + m.tokens_out * p.output_per_million / 1000000.0
    ) AS cost_usd
  FROM muse_messages m
  JOIN prices p ON p.model_id = m.model_id
  WHERE m.role = 'assistant'
    AND m.dt >= date_format(current_date - interval '30' day, '%Y-%m-%d')
  GROUP BY m.conversation_id
)
SELECT
  COUNT(*) AS conversations,
  AVG(cost_usd) AS avg_cost_usd,
  approx_percentile(cost_usd, 0.95) AS p95_cost_usd,
  SUM(cost_usd) AS total_cost_usd
FROM per_conversation;
```

### Q7. Day-over-day model usage

Becomes meaningful when Max-tier model selection ships (multi-model traffic split).

```sql
SELECT
  dt,
  model_id,
  COUNT(*) AS turns
FROM muse_messages
WHERE role = 'assistant'
  AND dt >= date_format(current_date - interval '14' day, '%Y-%m-%d')
GROUP BY dt, model_id
ORDER BY dt DESC, turns DESC;
```

### Q8. Drop-off — distribution of user turns per conversation

How often do users ask exactly once and never come back? `user_turns = 1` is the cohort to investigate.

```sql
WITH counts AS (
  SELECT
    conversation_id,
    COUNT_IF(role = 'user') AS user_turns
  FROM muse_messages
  WHERE dt >= date_format(current_date - interval '30' day, '%Y-%m-%d')
  GROUP BY conversation_id
)
SELECT
  user_turns,
  COUNT(*) AS conversations
FROM counts
GROUP BY user_turns
ORDER BY user_turns;
```

---

## 7. Future work

- **Cross-report memory queries (Max tier).** When that ships, the existing `org_id` column already supports it — `SELECT … FROM muse_messages WHERE org_id = ? AND dt >= …` gives the user's full chat history across reports without a schema change.
- **Streaming aggregations.** If query latency on raw Parquet becomes a problem, materialize daily rollups via an EventBridge-scheduled Athena CTAS job into a separate Glue table.
- **Per-user retention overrides.** The current 365-day lifecycle rule applies uniformly. If individual orgs request shorter retention (GDPR-style), add an S3 bucket policy or migrate to per-org prefixes.
