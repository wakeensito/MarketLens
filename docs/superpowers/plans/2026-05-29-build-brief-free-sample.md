# Build Brief — one free lifetime sample (free tier)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Let a **free** user generate exactly **one Build Brief, ever** (a single taste), then it reverts to the Pro upsell. Build Brief stays a Pro differentiator; free gets one "felt the value" sample.

**Architecture:** A lifetime per-user flag `free_build_brief_used` on the `USER#{user_id}` row (same Reports table the build-brief Lambda already writes). The brief itself still stores on the report row (existing idempotent write, unchanged). The free taste is **reserved atomically before the expensive LLM call** (conditional `UpdateItem`) and **released on failure**, matching the codebase's concurrency care — so a free user can never race two reports into two free briefs. GET is relaxed to authenticated-any (read-only, returns the flag so the UI knows the user's state). Frontend gains a `freeTaste` state: free + unused → show the Generate CTA (marked "1 free sample"); free + used → the Pro upsell.

**Tech Stack:** Python AWS Lambda (Powertools, APIGatewayRestResolver), DynamoDB conditional writes; React/Vite/TS frontend. Backend verified by `sam build` (no test runner for this Lambda); frontend by `bun run build`.

---

### Task 1: Backend — relax gate + lifetime taste reserve/release + GET flag

**Files:**
- Modify: `infrastructure/lambda/build-brief/app.py`

- [ ] **Step 1: Update the module docstring** (lines 1-8) — change "Paid-gated (pro/max/admin)." to: "Pro feature; **free users get one lifetime sample** (`free_build_brief_used` on the USER# row). Report must be complete."

- [ ] **Step 2: Split the gate so it no longer hard-blocks free.** Replace `_gate` (lines 81-97) with an auth-only gate (keep report-id validation + plan resolution, drop the paid 403):

```python
def _gate(report_id: str):
    """Auth + report-id precondition. Resolves the accurate plan onto auth.
    Does NOT block free users — the paid/taste decision happens per-route."""
    if not _REPORT_ID_RE.match(report_id):
        return None, ({"error": "Invalid report_id"}, 400)
    auth = _auth()
    if not auth["is_authenticated"]:
        return auth, ({"error": "Authentication required"}, 401)
    auth["plan"] = _fresh_plan(auth["user_id"], auth["plan"])
    return auth, None
```

- [ ] **Step 3: Add the lifetime-taste helpers** (after `_fresh_plan`, near line 67):

```python
def _free_brief_used(user_id: str) -> bool:
    """Has this free user already spent their one lifetime sample?"""
    try:
        row = (
            table.get_item(
                Key={"pk": f"USER#{user_id}", "sk": f"USER#{user_id}"},
                ConsistentRead=True,
                ProjectionExpression="free_build_brief_used",
            ).get("Item")
            or {}
        )
        return bool(row.get("free_build_brief_used"))
    except ClientError:
        # On read failure, fail CLOSED (treat as used) so we never over-grant.
        return True


def _reserve_free_brief(user_id: str) -> bool:
    """Atomically consume the one free sample. Returns True if reserved (it was
    available and is now spent), False if it was already used. Conditional write
    prevents a free user racing two reports into two free briefs."""
    try:
        table.update_item(
            Key={"pk": f"USER#{user_id}", "sk": f"USER#{user_id}"},
            UpdateExpression="SET free_build_brief_used = :t",
            ConditionExpression=(
                "attribute_not_exists(free_build_brief_used) "
                "OR free_build_brief_used = :f"
            ),
            ExpressionAttributeValues={":t": True, ":f": False},
        )
        return True
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return False
        raise


def _release_free_brief(user_id: str) -> None:
    """Give the sample back (generation failed after we reserved it)."""
    try:
        table.update_item(
            Key={"pk": f"USER#{user_id}", "sk": f"USER#{user_id}"},
            UpdateExpression="SET free_build_brief_used = :f",
            ExpressionAttributeValues={":f": False},
        )
    except ClientError:
        logger.warning("Failed to release free build-brief sample",
                       extra={"user_id": user_id})
```

- [ ] **Step 4: Relax GET** (`get_brief`, lines 100-112) to allow any authenticated user and return the flag so the UI knows the free user's state:

```python
@app.get("/reports/<report_id>/build-brief")
@tracer.capture_method
def get_brief(report_id: str):
    auth, err = _gate(report_id)
    if err:
        return err
    report = _get_report(auth["org_id"], report_id)
    if report is None:
        return {"error": "Report not found"}, 404
    free_used = (
        auth["plan"] not in _PAID_PLANS and _free_brief_used(auth["user_id"])
    )
    return {
        "build_brief_json": report.get("build_brief_json"),
        "build_brief_generated_at": report.get("build_brief_generated_at"),
        "free_brief_used": free_used,
    }
```

- [ ] **Step 5: Rework POST generation gate** (`generate_brief`, lines 115-194). Keep the idempotency + completeness checks; insert the taste/paid decision AFTER them (so an idempotent re-fetch of an existing brief never consumes a sample), and release on both the generation-exception path and the report-vanished 404 path.

Replace the body from the completeness check through the success return with:

```python
    result_json = report.get("result_json")
    if report.get("status") != "complete" or not result_json:
        return {"error": "Report is not complete yet", "code": "not_ready"}, 409

    # --- Generation gate: paid proceeds; free reserves its one lifetime sample ---
    is_paid = auth["plan"] in _PAID_PLANS
    reserved_free = False
    if not is_paid:
        reserved_free = _reserve_free_brief(auth["user_id"])
        if not reserved_free:
            return (
                {"error": "Build Brief is a Pro feature", "code": "upgrade_required"},
                403,
            )

    try:
        raw = llm.call_llm(
            prompt_mod.build_prompt(report.get("idea_text", ""), result_json),
            model_id=MODEL_ID,
        )
        brief_json = prompt_mod.parse_and_validate(raw)
    except Exception as e:
        if reserved_free:
            _release_free_brief(auth["user_id"])
        logger.exception(
            "Build Brief generation failed",
            extra={"report_id": report_id, "error": str(e)},
        )
        metrics.add_dimension(name="plan", value=auth["plan"])
        metrics.add_metric(name="BuildBriefFailed", unit=MetricUnit.Count, value=1)
        return {"error": "Could not generate the brief. Try again."}, 502

    generated_at = datetime.now(timezone.utc).isoformat()
    try:
        table.update_item(
            Key={
                "pk": f"ORG#{auth['org_id']}#REPORT#{report_id}",
                "sk": f"REPORT#{report_id}",
            },
            UpdateExpression="SET build_brief_json = :b, build_brief_generated_at = :t",
            ConditionExpression="attribute_exists(pk) AND attribute_not_exists(build_brief_json)",
            ExpressionAttributeValues={":b": brief_json, ":t": generated_at},
        )
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            existing = table.get_item(
                Key={
                    "pk": f"ORG#{auth['org_id']}#REPORT#{report_id}",
                    "sk": f"REPORT#{report_id}",
                },
                ConsistentRead=True,
                ProjectionExpression="build_brief_json, build_brief_generated_at",
            ).get("Item")
            if existing and existing.get("build_brief_json"):
                # A concurrent request already stored a brief for this report.
                # The sample we reserved produced nothing of our own — give it back.
                if reserved_free:
                    _release_free_brief(auth["user_id"])
                return {
                    "build_brief_json": existing["build_brief_json"],
                    "build_brief_generated_at": existing.get("build_brief_generated_at"),
                }
            if reserved_free:
                _release_free_brief(auth["user_id"])
            return {"error": "Report not found"}, 404
        raise

    logger.info("Build Brief generated", extra={"report_id": report_id})
    metrics.add_dimension(name="plan", value=auth["plan"])
    metrics.add_metadata(key="tech_dominant", value=str(brief_json["is_tech_dominant"]))
    metrics.add_metric(name="BuildBriefGenerated", unit=MetricUnit.Count, value=1)
    return {"build_brief_json": brief_json, "build_brief_generated_at": generated_at}
```

(The idempotent early-return for an already-stored brief at lines 127-132 stays ABOVE this block, unchanged — so re-opening a briefed report never touches the sample.)

- [ ] **Step 6: Verify.** `python -c "import ast; ast.parse(open('app.py').read())"` from the lambda dir (no error). From repo root `sam build 2>&1 | tail -3` → Build Succeeded (or note if sam unavailable). Confirm the build-brief Lambda's IAM in `template.yaml` grants `UpdateItem` on the Reports table (it already writes report rows via a `DynamoDBCrudPolicy`/equivalent — USER# rows are the same table, so it's covered; note what you found).

- [ ] **Step 7: Commit.**
```bash
git add infrastructure/lambda/build-brief/app.py
git commit -m "feat: free users get one lifetime Build Brief sample (atomic reserve/release)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Frontend — free-taste state in the hook + Invitation CTA

**Files:**
- Modify: `frontend/src/api.ts` (BuildBriefResponse type)
- Modify: `frontend/src/hooks/useBuildBrief.ts`
- Modify: `frontend/src/components/BuildBrief.tsx`

- [ ] **Step 1: Add `free_brief_used` to the GET response type.** In `api.ts`, find the build-brief response interface (the return type of `getBuildBrief`, likely `BuildBriefResponse`) and add `free_brief_used?: boolean;`.

- [ ] **Step 2: Add free-taste logic to `useBuildBrief.ts`.** Add `freeTaste: boolean` to `UseBuildBriefResult` (true ⇒ the Generate CTA is the user's one free sample). Changes:
  - Add `const [freeTaste, setFreeTaste] = useState(false);` and reset it to `false` at the top of the hydrate effect.
  - **Remove the `if (!paid) { setStatus('locked'); return; }` short-circuit** (lines 64-67). Instead, for ALL authenticated users, do the GET hydrate. New hydrate result handling:
    - `res.build_brief_json` present → `ready` (unchanged).
    - else if **paid** → `idle` (unchanged).
    - else (free): if `res.free_brief_used` → `locked`; else → `idle` **and** `setFreeTaste(true)`.
  - GET `catch`: `401` → `locked` (anon). `403` → `locked`. Other/404 → if paid `idle`; if free, leave `locked` (can't confirm taste availability without the flag — fail closed). Use the `paid` flag to decide the fallback.
  - **Under `USE_MOCK`:** paid → `idle`; free → `idle` + `setFreeTaste(true)` (so the free CTA is demoable).
  - `generate()`: change the guard `if (!reportId || !paid) return;` → `if (!reportId || (!paid && !freeTaste)) return;`. On a `403` from `generateBuildBrief` (taste used / lost a race), set `status='locked'` and `setFreeTaste(false)` instead of `error`.
  - Return `freeTaste` in the result object.

- [ ] **Step 3: Surface the free sample in the Invitation (`BuildBrief.tsx`).** READ the `Invitation` component and `BuildBriefPane` first. Add a `freeTaste?: boolean` prop to `Invitation`. Behavior:
  - `locked` (no taste / anon / used) → unchanged Upgrade CTA.
  - `freeTaste && !locked` → render the **Generate** CTA (same as the paid idle CTA) PLUS a subtle marker line in mono, e.g. `Your free build brief · 1 sample`, and a one-line nudge that more briefs need Pro. Use existing classes (`.bb-cta`, the eyebrow/marker styling already in build-brief.css); do not invent heavy new chrome.
  - paid `idle` (no `freeTaste`) → unchanged Generate CTA.
  In `BuildBriefPane`, pass `freeTaste={buildBrief.freeTaste}` through to `Invitation` for the idle/locked render path.

- [ ] **Step 4: Verify build.** From `frontend/`: `bun run build` → clean.

- [ ] **Step 5: Commit.**
```bash
git add frontend/src/api.ts frontend/src/hooks/useBuildBrief.ts frontend/src/components/BuildBrief.tsx
git commit -m "feat: free Build Brief sample — freeTaste state + Invitation CTA

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Docs — reposition Build Brief as "Pro, with one free sample"

**Files:**
- Modify: `PRODUCT.md`, `CLAUDE.md` (wherever Build Brief is described as Pro-only / locked)

- [ ] **Step 1:** Update the Build Brief descriptions so they say free users get **one lifetime sample**, then Pro. In `CLAUDE.md` the Build Brief design note (locked/idle states) and the Plans section; in `PRODUCT.md` the register/positioning. Keep edits minimal and factual — Build Brief remains a Pro feature, free gets a single taste.

- [ ] **Step 2: Commit.**
```bash
git add CLAUDE.md PRODUCT.md
git commit -m "docs: Build Brief — free users get one lifetime sample

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Manual verification after merge + deploy
- Free user, fresh: open a completed report → Build Brief tab shows "Generate your free build brief · 1 sample". Generate → renders. Reopen → still shows (idempotent).
- Same free user, a DIFFERENT report → Build Brief tab shows the Pro upsell (sample spent).
- Paid user → unchanged (generate any/all).
- Anon → sign-in/upsell (unchanged).

## Out of scope
- Changing the free *report* limit (stays 3/day). This only changes Build Brief gating.
- A configurable N (we hardcode one lifetime sample; switch the boolean flag to a count later if needed).
