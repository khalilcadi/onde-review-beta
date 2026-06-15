# Consistency & Integrity Audit (repo-specific)

## 0) Scan map (where core concerns live)

- **DB schema / migrations**: `supabase/migrations/*.sql` (notably `001_initial_schema.sql`, `004_generation_mode.sql`, `005_messages_dedup_constraint.sql`).
- **Model/type layer**: `types/*.ts`, `lib/mappers.ts`.
- **Prompts / agents**: `lib/ai/prompts/defaults.ts`, `lib/ai/prompts/service.ts`, `app/(dashboard)/settings/prompts/*`.
- **Scoring logic**: `app/api/ai/score/route.ts` + scoring prompt in `lib/ai/prompts/defaults.ts`.
- **Status enums / state labels**: `lib/constants.ts`, `types/leads.ts`, `types/actions.ts`, `types/sequences.ts`.
- **RAG ingestion/retrieval/injection**: `knowledge/*.json`, `lib/rag/mapping.ts`, `lib/rag/context.ts`, `lib/ai/prompts/service.ts`.
- **Background jobs / queues / webhooks**: `vercel.json`, `app/api/crons/generate-actions/route.ts`, `app/api/crons/send-actions/route.ts`, `app/api/webhooks/unipile/route.ts`.

---

## 1) System map: entities, fields, read/write paths, flows

### Lead
- **Defined**: SQL `leads` table + text status/stage + enrichment JSON. TS in `types/leads.ts` and mapper in `lib/mappers.ts`.
- **Key fields**: identity (`first_name`, `last_name`, `linkedin_url`), lifecycle (`status`, `stage`), score, enrichment JSON, ownership (`user_id`).
- **Read/write**:
  - CRUD: `lib/actions/leads.ts`.
  - Scoring writes `score` + `enrichment_data.scoring_detail`: `app/api/ai/score/route.ts`.
  - Enrichment writes merged `enrichment_data`, may auto-stage to `connected`: `app/api/ai/enrich/route.ts`.
  - Execution/webhooks mutate stage (`invited`, `in_sequence`, `responded`, `connected`): `lib/unipile/execute.ts`, `app/api/webhooks/unipile/route.ts`.
- **Primary flows**: import/create -> enrich -> score -> sequence action generation -> send -> webhook updates.

### Company / Account
- **Company** is denormalized inside lead fields (`company`) + enrichment JSON (`company.*`) not a separate relational table.
- **Linked account entity** is `linkedin_accounts` with `unipile_account_id`, status, account type.
- **Read/write**: `lib/actions/linkedin.ts`, `app/api/linkedin/auth/callback/route.ts`, webhook status updates in `app/api/webhooks/unipile/route.ts`.

### Relationship / Connection
- **Not modeled as first-class table**; represented by lead stage (`to_invite`, `invited`, `connected`, etc.) and Unipile relation events.
- **Mutations**: invitation send (`to_invite -> invited`) and relation webhook (`invited -> connected`).

### Conversation / Thread
- **Defined**: `conversations` table with `channel`, `unipile_chat_id`, `status`, `lead_id`.
- **Read/write**: webhook upsert/find-create, direct messaging flow, inbox actions.

### Message
- **Defined**: `messages` table; dedupe uniqueness on `(conversation_id, timestamp)`.
- **Read/write**: webhook upsert (idempotent), direct send insert, conversation reply insert.

### Enrichment
- **Defined**: embedded in `leads.enrichment_data` (no separate table).
- **Flow**: collect Unipile profile/posts + Perplexity web data, parse JSON, merge in lead.

### Score
- **Defined**: scalar `leads.score` + nested `enrichment_data.scoring_detail`.
- **Flow**: `/api/ai/score` callAI(scoring) -> parse strict JSON -> persist.

### Campaign / Sequence
- **Defined**: `sequences`, `sequence_steps`, `sequence_leads`.
- **Flow**: create sequence -> add leads -> cron generates pending actions when delay/conditions pass -> send cron executes actions and advances step.

### Task / Action
- **Defined**: `actions` table (`pending/validated/sent/failed/...`).
- **Flow**: generation cron inserts pending -> user validates -> send cron marks processing/sent/failed.

### Prompt
- **Defined**: defaults in code + user overrides in `user_prompts`.
- **Flow**: buildSystemPrompt combines prompt + mapped RAG blocks.

### Agent
- **Defined**: four agents `prospection`, `scoring`, `enrichissement`, `conversational`.
- **Flow**: routes call unified AI service with runtime context.

### Document / RAG
- **Defined**: JSON files in `knowledge/` and optional per-user overrides in `user_rag_data`.
- **Flow**: load whole mapped blocks, format to plain text, append to system prompt.

---

## 2) State machines + invariants

### A. Lead lifecycle (inferred actual)
1. `to_invite` (default)
2. `invited` (after invitation send)
3. `connected` (relation webhook OR enrichment auto-correct from 1st-degree network)
4. `in_sequence` (message/inmail sent when prior stage is `connected` or already `in_sequence`)
5. `responded` (inbound message webhook for invited/in_sequence)
6. `meeting` / `closed` appear in enums/UI but have no explicit transition logic in backend routes.

### B. Relationship/connection lifecycle (inferred)
- implicit states via lead stage:
  - not connected: `to_invite`, `invited`
  - connected: `connected`, `in_sequence`, `responded`, `meeting`, `closed`
- external truth source: Unipile relation/message webhooks.

### Hard invariants and current enforcement gaps

1) **Invariant**: sequence lead status vocabulary must be consistent.
- **Should hold**: if code writes `replied`, types and business logic should use same token.
- **Enforced**: partially in cron condition checks for `replied`.
- **Violated**: TS type defines `responded` (not `replied`).
- **Fix**: choose one canonical value (`responded` or `replied`) and migrate DB + types + checks together.

2) **Invariant**: action status vocabulary must include all runtime states.
- **Should hold**: if send cron sets `processing`, ActionStatus type must include it.
- **Enforced**: runtime uses `processing` lock.
- **Violated**: `types/actions.ts` lacks `processing`.
- **Fix**: add `processing` to ActionStatus and any UI filter assumptions.

3) **Invariant**: prompt stage semantics must match DB stage enum.
- **Should hold**: prompts expecting `prospect/connected/replied` should map to actual stages (`to_invite/invited/connected/in_sequence/responded/...`).
- **Enforced**: none.
- **Violated**: prospection/scoring prompts use stage names not emitted by DB/runtime.
- **Fix**: either normalize runtime context stage aliasing, or rewrite prompts to native stage taxonomy.

4) **Invariant**: inbound webhook must advance lead/sequence state regardless of conversation preexistence.
- **Should hold**: first inbound message on new chat should update lead stage/sequence status when lead is matched.
- **Enforced**: only when `existingConv` present.
- **Violated**: handler uses `existingConv?.lead_id` instead of resolved/new conversation lead.
- **Fix**: carry `leadId` variable across both branches and use it for stage/status updates.

5) **Invariant**: upsert conflict targets must correspond to actual unique constraints.
- **Should hold**: `onConflict: "user_id"` requires unique index on `linkedin_accounts.user_id`.
- **Enforced**: none.
- **Violated**: table has no unique user_id constraint, but callbacks/actions rely on upsert by user_id.
- **Fix**: add unique constraint `linkedin_accounts(user_id)` or change logic to update-then-insert.

6) **Invariant**: anti-duplicate lead creation should be owner-aware if pool-sharing is intended.
- **Should hold**: duplicate policy should match business rule (global vs per-owner).
- **Enforced**: global check only on linkedin_url.
- **Ambiguity**:
  - Interpretation A: global uniqueness intended (shared pool) -> current logic is correct, add DB unique index.
  - Interpretation B: per-owner uniqueness intended -> query should include `user_id` and DB composite unique.
- **Disambiguation**: decide using product spec for shared-lead ownership/claiming.

---

## 3) Prompt ↔ code alignment audit

### Prompt inventory (active)
- Default agent prompts embedded in `lib/ai/prompts/defaults.ts`.
- User overrides from DB `user_prompts` via `lib/ai/prompts/service.ts`.
- Runtime builders in `lib/ai/lead-context.ts`.

### Extracted contracts
- **Prospection**: expects raw text output only, stage logic based on `prospect|connected|replied`, signal template routing.
- **Scoring**: expects strict JSON output with category/confidence/detail fields, ICP = solopreneur 5-10k €/mois.
- **Enrichissement**: strict JSON, signal taxonomy, confidence/sources/summary.
- **Conversational**: text output, cockpit + correction assistant role.

### Mismatches
1. **Stage terminology mismatch** (major): prompts use `prospect/replied`; DB/UI/code use `to_invite/invited/responded/in_sequence/...`.
2. **Status taxonomy drift**: scoring prompt references `cold|warm|hot`, but code/types also include `converted|lost`.
3. **Potential parse mismatch risk**: scoring route parses raw JSON with fence stripping; any prompt drift from strict JSON fails hard.
4. **Agent-role overlap ambiguity**:
   - conversational handles both cockpit and message correction;
   - suggest route also uses conversational agent but injects lead conversation history and a hardcoded “return message only” user instruction.
   - Could produce inconsistent style if system prompt and route-level instruction diverge.

---

## 4) RAG pipeline audit

### Actual implementation
- No embeddings/vector DB pipeline in active code.
- RAG = static JSON block loading from `knowledge/` + optional user override JSON from DB.
- Retrieval = **agent-level block mapping only** (all mapped blocks injected wholesale as plain text).

### Risks / inconsistencies
1. **No semantic retrieval/chunk filtering**: whole blocks injected can mix unrelated guidance and increase prompt dilution.
2. **No citation/grounding protocol in prompts**: agents are not required to cite source blocks/sections.
3. **Prompt injection risk surface**: user overrides in `user_rag_data` are directly injected after minimal structural checks.
4. **Single-source-of-truth drift**: legacy prompt markdown (`promtp V4`) and orchestrator docs coexist with embedded defaults; risk of human edits in wrong place.

### “RAG says X, scoring says Y”
- Current ICP in knowledge and scoring prompt both target solopreneur profile (aligned at high level).
- However stage/status ontology in prompts diverges from runtime state names, so operational behavior can still be inconsistent even with aligned ICP.

### Recommendation (SSOT)
- Declare `lib/ai/prompts/defaults.ts` + `knowledge/*.json` as the only runtime prompt/RAG sources; mark other copies read-only archival.
- Add schema validators for RAG override JSON.
- Introduce selective retrieval (section-level scoring or keyword routing) before injection.

---

## 5) Data integrity & sync issues (externals, races, stale state)

### External sources / integrations
- Unipile API client + hosted auth + webhook.
- Perplexity API for enrichment.
- Anthropic/OpenAI for AI generation/scoring/chat.
- Scheduled crons via Vercel.

### Race/staleness findings
1. **Webhook first-message stage sync bug** (described above).
2. **Action send lock is optimistic but not idempotent-keyed**:
   - Uses status flip `validated -> processing` in one query (good), but no durable idempotency key from provider response.
3. **Lead stage vs sequence status divergence**:
   - webhook sets lead `responded` + sequence_leads `replied`; other flows may update lead without touching sequence_leads.
4. **LinkedIn account upsert conflict mismatch** can fail sync path silently in callback.

### Transactional boundaries / idempotency proposals
- Wrap per-action execution in RPC/transaction (status lock -> send -> mark sent/failed -> advance step).
- Add `external_event_id` / `provider_message_id` columns for webhook and outbound idempotency.
- Add reconciliation jobs:
  - nightly lead-stage vs sequence_leads-status consistency checker,
  - linkedin_accounts status reconciler against Unipile accounts,
  - orphan conversation/lead linker.

---

## 6) Dead code / unused features

### Unused but should be used
1. **DB-level constraints for statuses/stages**: currently text columns with no CHECK constraints; code carries many string literals.
2. **Unique key for linkedin_accounts(user_id)** expected by upsert code paths.

### Likely safe to remove (or keep archived)
1. `_archive/**` is explicitly excluded from TypeScript build and documented as non-runtime archive.
2. `promtp V4/*.md` appears to be source material; runtime uses embedded prompt constants.
3. `PROMPTS_ORCHESTRATOR.md` is process documentation, not runtime dependency.

---

## 7) Test plan + highest-impact quick fixes

### Automated checks to add
1. **Unit tests for invariants**
   - canonical status/stage vocab map,
   - lead stage/sequence status coherence after webhook handlers.
2. **Property-based tests for transitions**
   - generate random valid/invalid stage transitions and assert forbidden edges rejected.
3. **Integration tests (enrich -> score -> message)**
   - fake Unipile + fake AI responses; assert DB writes and stage changes.
4. **DB consistency checker script**
   - SQL/TS script validating enum-like values, orphan references, contradictory states.

### Top 10 fixes (impact-first)
1. Add DB CHECK constraints for `leads.stage`, `leads.status`, `actions.status`, `sequence_leads.status`.
2. Unify stage taxonomy across prompts/runtime (`prospect/replied` vs DB values).
3. Fix webhook `existingConv?.lead_id` bug to update stage on first inbound.
4. Add `UNIQUE(linkedin_accounts.user_id)` or remove `upsert(...onConflict:user_id)` assumptions.
5. Unify `replied` vs `responded` naming across DB/types/cron/webhook.
6. Add `processing` to ActionStatus type and enforce exhaustive UI handling.
7. Add idempotency keys (`provider_message_id`, `webhook_event_id`) and unique indexes.
8. Create transactional send-action RPC to prevent partial writes.
9. Add consistency reconciliation cron + dashboard alerting.
10. Implement section-level RAG retrieval + prompt citation requirement.

---

## Ambiguities & how to disambiguate quickly

1. **Global lead uniqueness policy**
- A: shared-pool global dedupe on LinkedIn URL (current app logic).
- B: per-user dedupe only.
- **Disambiguate**: inspect product requirements + expected behavior in list import UX.

2. **Canonical response state token**
- A: `responded` (human-readable, used in lead.stage).
- B: `replied` (currently used in sequence_leads runtime logic).
- **Disambiguate**: choose one taxonomy and codify in DB constraints + TS enums.

3. **Company entity roadmap**
- A: keep denormalized in lead/enrichment JSON.
- B: introduce first-class accounts table for dedupe and account-level scoring.
- **Disambiguate**: inspect whether campaign/sequence targeting is account-based in roadmap.

---

## Consistency dashboard (checklist)

| Invariant | Current enforcement | Gap |
|---|---|---|
| Lead stage vocabulary canonical | UI/constants/types only | No DB constraints; prompt mismatch |
| Sequence response status canonical | Partial in cron/webhook | `responded` vs `replied` split |
| Action status canonical incl. processing | Runtime uses processing | Type mismatch |
| Stage transitions coherent across send/enrich/webhook | Distributed imperative updates | Missing central state machine/validator |
| Upsert conflict targets valid | Assumed in code | Missing unique index on linkedin_accounts.user_id |
| Webhook idempotency | message dedupe by conversation+timestamp | No event/message-id idempotency across all handlers |
| RAG source-of-truth | mapped block loading works | no semantic retrieval, no grounding/citation requirements |

