# Athena Analytics Queries

Production-ready SQL queries for analyzing MarketLens reports in Athena.

All queries filter out test data (`org_id = 'unknown'`) and null values.

---

## Setup

### Create Database

```sql
CREATE DATABASE IF NOT EXISTS marketlens;
```

### Create Table

```sql
CREATE EXTERNAL TABLE marketlens.reports (
  org_id STRING,
  report_id STRING,
  status STRING,
  total_cost_usd DOUBLE,
  total_tokens_input INT,
  total_tokens_output INT,
  result_business_model STRING,
  result_difficulty_label STRING,
  result_difficulty_score BIGINT,
  result_gaps STRING,
  result_geography STRING,
  result_key_stats STRING,
  result_market_size STRING,
  result_oneliner STRING,
  result_opportunity_score BIGINT,
  result_saturation_score BIGINT
)
STORED AS PARQUET
LOCATION 's3://marketlens-reports-parquet-dev/';
```

---

## Business Intelligence Queries

### 1. Average Saturation by Business Model

Shows which business models have the most/least competition.

```sql
SELECT result_business_model, 
       AVG(result_saturation_score) as avg_saturation,
       AVG(result_opportunity_score) as avg_opportunity,
       COUNT(*) as reports
FROM marketlens.reports
WHERE org_id != 'unknown'
  AND result_saturation_score IS NOT NULL
  AND result_opportunity_score IS NOT NULL
GROUP BY result_business_model
ORDER BY reports DESC;
```

### 2. High-Opportunity Markets

Markets with low saturation (<30%) and high opportunity (>80%).

```sql
SELECT result_business_model,
       result_geography,
       result_saturation_score,
       result_opportunity_score,
       result_oneliner
FROM marketlens.reports
WHERE org_id != 'unknown'
  AND result_saturation_score < 30
  AND result_opportunity_score > 80
ORDER BY result_opportunity_score DESC, result_saturation_score ASC
LIMIT 20;
```

### 3. Market Saturation by Geography

Compare saturation levels across different regions.

```sql
SELECT result_geography,
       AVG(result_saturation_score) as avg_saturation,
       AVG(result_opportunity_score) as avg_opportunity,
       COUNT(*) as reports
FROM marketlens.reports
WHERE org_id != 'unknown'
  AND result_geography IS NOT NULL
  AND result_saturation_score IS NOT NULL
GROUP BY result_geography
HAVING COUNT(*) >= 3
ORDER BY avg_opportunity DESC;
```

### 4. Difficulty Distribution

Breakdown of market difficulty levels.

```sql
SELECT result_difficulty_label,
       AVG(result_difficulty_score) as avg_difficulty,
       AVG(result_saturation_score) as avg_saturation,
       COUNT(*) as reports
FROM marketlens.reports
WHERE org_id != 'unknown'
  AND result_difficulty_label IS NOT NULL
GROUP BY result_difficulty_label
ORDER BY avg_difficulty DESC;
```

---

## Cost & Usage Analytics

### 5. Total Cost by Organization

Track AI costs per customer.

```sql
SELECT org_id,
       COUNT(*) as reports_generated,
       SUM(total_tokens_input + total_tokens_output) as total_tokens,
       SUM(total_cost_usd) as total_cost_usd,
       AVG(total_cost_usd) as avg_cost_per_report,
       MIN(total_cost_usd) as min_cost,
       MAX(total_cost_usd) as max_cost
FROM marketlens.reports
WHERE org_id != 'unknown'
  AND status = 'complete'
GROUP BY org_id
ORDER BY total_cost_usd DESC;
```

### 6. Token Usage Trends

Analyze token consumption patterns.

```sql
SELECT 
  CAST(AVG(total_tokens_input) AS INT) as avg_input_tokens,
  CAST(AVG(total_tokens_output) AS INT) as avg_output_tokens,
  CAST(AVG(total_tokens_input + total_tokens_output) AS INT) as avg_total_tokens,
  CAST(SUM(total_tokens_input + total_tokens_output) AS BIGINT) as total_tokens_all_reports,
  COUNT(*) as reports
FROM marketlens.reports
WHERE org_id != 'unknown'
  AND status = 'complete';
```

### 7. Cost Efficiency by Business Model

Which business models are most expensive to analyze?

```sql
SELECT result_business_model,
       COUNT(*) as reports,
       AVG(total_cost_usd) as avg_cost,
       AVG(total_tokens_input + total_tokens_output) as avg_tokens
FROM marketlens.reports
WHERE org_id != 'unknown'
  AND status = 'complete'
  AND result_business_model IS NOT NULL
GROUP BY result_business_model
HAVING COUNT(*) >= 3
ORDER BY avg_cost DESC;
```

---

## Product Analytics

### 8. Report Completion Rate

Success rate of report generation.

```sql
SELECT 
  status,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM marketlens.reports
WHERE org_id != 'unknown'
GROUP BY status;
```

### 9. Most Analyzed Markets

What are users most interested in?

```sql
SELECT result_business_model,
       result_geography,
       COUNT(*) as reports
FROM marketlens.reports
WHERE org_id != 'unknown'
  AND result_business_model IS NOT NULL
GROUP BY result_business_model, result_geography
ORDER BY reports DESC
LIMIT 20;
```

### 10. Recent Activity

Last 30 days of report generation (requires created_at timestamp).

```sql
SELECT 
  DATE_TRUNC('day', from_iso8601_timestamp(created_at)) as report_date,
  COUNT(*) as reports_generated,
  SUM(total_cost_usd) as daily_cost
FROM marketlens.reports
WHERE org_id != 'unknown'
  AND status = 'complete'
  AND created_at IS NOT NULL
  AND from_iso8601_timestamp(created_at) >= CURRENT_DATE - INTERVAL '30' DAY
GROUP BY DATE_TRUNC('day', from_iso8601_timestamp(created_at))
ORDER BY report_date DESC;
```

---

## Market Intelligence Queries

### 11. Underserved Markets

Low saturation + high difficulty = opportunity for experienced players.

```sql
SELECT result_business_model,
       result_geography,
       result_saturation_score,
       result_difficulty_score,
       result_opportunity_score,
       result_oneliner
FROM marketlens.reports
WHERE org_id != 'unknown'
  AND result_saturation_score < 40
  AND result_difficulty_score > 60
  AND result_opportunity_score > 70
ORDER BY result_opportunity_score DESC
LIMIT 15;
```

### 12. Crowded Markets to Avoid

High saturation + low opportunity = red flags.

```sql
SELECT result_business_model,
       result_geography,
       result_saturation_score,
       result_opportunity_score,
       result_oneliner
FROM marketlens.reports
WHERE org_id != 'unknown'
  AND result_saturation_score > 60
  AND result_opportunity_score < 40
ORDER BY result_saturation_score DESC
LIMIT 15;
```

### 13. Market Gaps Analysis

Extract common gaps across markets (requires JSON parsing).

```sql
SELECT result_business_model,
       result_gaps,
       COUNT(*) as reports
FROM marketlens.reports
WHERE org_id != 'unknown'
  AND result_gaps IS NOT NULL
  AND result_gaps != ''
GROUP BY result_business_model, result_gaps
ORDER BY reports DESC
LIMIT 20;
```

---

## Export Queries

### 14. Full Report Export (CSV)

Export all production reports for external analysis.

```sql
SELECT 
  report_id,
  org_id,
  status,
  result_business_model,
  result_geography,
  result_saturation_score,
  result_opportunity_score,
  result_difficulty_score,
  result_difficulty_label,
  result_market_size,
  result_oneliner,
  total_cost_usd,
  total_tokens_input,
  total_tokens_output
FROM marketlens.reports
WHERE org_id != 'unknown'
  AND status = 'complete'
ORDER BY report_id;
```

---

## Query Tips

### Performance Optimization

1. **Always filter by `org_id != 'unknown'`** to exclude test data
2. **Use `LIMIT`** when exploring data
3. **Partition by date** when dataset grows (future enhancement)
4. **Select only needed columns** (columnar format = faster queries)

### Cost Optimization

- Athena charges **$5 per TB scanned**
- Current dataset (~500 KB) = **$0.0000025 per full table scan**
- Use `WHERE` clauses to reduce data scanned
- Avoid `SELECT *` in production queries

### Common Filters

```sql
-- Production data only
WHERE org_id != 'unknown'

-- Completed reports only
WHERE status = 'complete'

-- Valid scores only
WHERE result_saturation_score IS NOT NULL
  AND result_opportunity_score IS NOT NULL

-- Minimum sample size
HAVING COUNT(*) >= 3
```

---

## Troubleshooting

### Query fails with "HIVE_BAD_DATA"

- **Cause**: Schema mismatch between Athena table and Parquet files
- **Fix**: Drop and recreate table with correct data types (see Setup section)

### All columns return NULL

- **Cause**: DataBrew didn't unnest the `result` object
- **Fix**: Check DataBrew recipe has "Unnest" step with underscore delimiter

### "Queries of this type are not supported"

- **Cause**: Column names with dots (`.`) in GROUP BY or aggregations
- **Fix**: Use underscore delimiter in DataBrew (columns like `result_saturation_score`)

---

## Next Steps

1. **Save frequently-used queries** in Athena "Saved queries" tab
2. **Set up QuickSight dashboards** for visual analytics (optional)
3. **Add partitioning** when dataset exceeds 10K reports
4. **Schedule query exports** to S3 for automated reporting

---

## Related Documentation

- [DataBrew Setup Guide](./DATABREW-SETUP.md)
- [S3 Export Script](../scripts/export-reports-to-s3.py)
- [Milestones & Sprints](./05-milestones-and-sprints.md)
