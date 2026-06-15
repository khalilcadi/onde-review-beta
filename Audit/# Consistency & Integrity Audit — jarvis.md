# Consistency & Integrity Audit — jarvisprospector

## 0) Repo scan: where each concern lives

- **DB schema/migrations**: `supabase/migrations/*.sql` (core tables, indexes, constraints, RLS).
- **DB/ORM types**: `types/database.ts` (Supabase row/insert/update), domain types in `types/leads.ts`, `types/sequences.ts`, `types/actions.ts`.
- **Business logic / state transitions**:
  - Lead CRUD: `lib/actions/leads.ts`
  - Sequence/action lifecycle: `app/api/crons/generate-actions/route.ts`, `app/api/crons/send-actions/route.ts`, `lib/unipile/execute.ts`
  - Webhook sync: `app/api/webhooks/unipile/route.ts`
  - Conversations: `lib/actions/conversations.ts`
- **Prompts/agents**:
  - Runtime prompt source: `lib/ai/prompts/defaults.ts`
  - Prompt loading/override: `lib/ai/prompts/service.ts`
  - Prompt assembly context: `lib/ai/lead-context.ts`
  - Orchestration doc/history: `PROMPTS_ORCHESTRATOR.md`, `promtp V4/*`
- **Scoring/enrichment/generation routes**: `app/api/ai/{score,enrich,generate,suggest,chat}/route.ts`
- **RAG ingestion/retrieval/mapping**:
  - Mapping: `lib/rag/mapping.ts`
  - Loader/injection/cache: `lib/rag/context.ts`
  - Corpus: `knowledge/*.json`
- **External integrations**:
  - Unipile client/types: `lib/unipile/client.ts`, `lib/unipile/types.ts`
  - LinkedIn send API: `app/api/linkedin/send/route.ts`
  - Unipile webhook endpoint: `app/api/webhooks/unipile/route.ts`

---

## 1) System map (entities, fields, flows)

### A. Lead
- **Defined in DB**: `leads` table with `status`, `stage`, `score`, `enrichment_data`.
- **Typed in code**:
  - Raw DB: `types/database.ts` (`Tables["leads"]`)
  - Domain: `types/leads.ts` (`Lead`, `LeadStatus`, `LeadStage`)
- **Read/write**:
  - CRUD: `lib/actions/leads.ts`
  - AI score update: `app/api/ai/score/route.ts` (updates `score`, `enrichment_data.scoring_detail`)
  - AI enrichment update: `app/api/ai/enrich/route.ts` (merges `enrichment_data`, optional stage autocorrect)
  - State transitions from execution: `lib/unipile/execute.ts` + webhook `app/api/webhooks/unipile/route.ts`
- **Primary flows**:
  1. Imported/created (`to_invite` default)
  2. Enriched (Perplexity + Unipile data merged)
  3. Scored
  4. Sequenced → actions generated/sent
  5. Stage updated by outbound sends and inbound webhooks

### B. Company/Account
- **No first-class `companies/accounts` table for lead firms**; company is a string on `leads.company`.
- **LinkedIn account entity exists**: `linkedin_accounts` (`user_id`, `unipile_account_id`, status).
- **Flow**: user integration account is used by send cron, enrichment, webhook account lookup.

### C. Relationship / Connection
- **Implicit only** (no dedicated table).
- Encoded via `leads.stage` (`invited`, `connected`, `responded`) and Unipile relation webhook.
- Autocorrect path in enrich route also infers connected state from network distance.

### D. Conversation/Thread
- **DB**: `conversations` (`lead_id`, `channel`, `unipile_chat_id`, `status`, `updated_at`).
- **Flow**: created in webhook or direct send path, used for inbox and AI suggest.

### E. Message
- **DB**: `messages` (`conversation_id`, `direction`, `content`, `timestamp`) with unique `(conversation_id,timestamp)` constraint.
- **Flow**: inserted by webhook upsert, manual send, and direct send process.

### F. Enrichment
- **No dedicated table**; stored as JSON in `leads.enrichment_data`.
- Shape implied by `types/leads.ts` and prompt context builders (`company/person/signal/linkedin_profile/scoring_detail`).

### G. Score
- **Scalar score** in `leads.score`.
- **Details JSON** in `leads.enrichment_data.scoring_detail`.
- Computed by `/api/ai/score`, parsed from LLM JSON.

### H. Campaign / Sequence
- **DB**: `sequences`, `sequence_steps`, `sequence_leads`.
- **Flow**: sequence setup → cron generate actions per step and conditions → send cron executes and advances `current_step`.

### I. Task / Action
- **DB**: `actions` with statuses and scheduling fields.
- **Flow**: generated as `pending`, user validates/schedules, send cron transitions `validated`→`processing`→`sent/failed`.

### J. Prompt
- **Default prompt store in code**: `lib/ai/prompts/defaults.ts`.
- **User overrides in DB**: `user_prompts` loaded by `lib/ai/prompts/service.ts`.

### K. Agent
- **Agent IDs**: `prospection`, `scoring`, `enrichissement`, `conversational`.
- **Runtime call path**: routes call `callAI` / `callPerplexity`, which build system prompt + RAG + runtime context.

### L. Document / RAG
- **Corpus**: static JSON docs in `knowledge/`.
- **No embeddings/vector DB**; retrieval is deterministic mapping of entire blocks per agent.
- **User override documents** via `user_rag_data` table.

---

## 2) State machines + invariants

## Lead lifecycle (inferred)

`to_invite` → `invited` → `connected` → `in_sequence` → `responded` → (`meeting`?) → (`closed`?)

Observed transitions in code:
- `to_invite` → `invited`: invitation send success in `executeLinkedInAction`.
- `invited` → `connected`: relation webhook.
- `to_invite|invited` → `connected`: enrichment autocorrect using network distance.
- `connected|in_sequence` → `in_sequence`: outbound message send.
- `invited|in_sequence` → `responded`: inbound message webhook.

### Relationship/connection lifecycle (implicit)
`unknown` → `invited` → `connected` → `responded`.

### Hard invariants (required)

1. **Stage vocabulary must be consistent across DB, types, prompts, and transition code.**
   - **Enforced**: partially by TS unions in `types/leads.ts`.
   - **Violated**: prompts/docs refer to `prospect/replied`, while DB/types/logic use `to_invite/responded`.
   - **Fix**: introduce canonical enum mapping layer + DB CHECK constraint for `leads.stage`.

2. **If stage = `connected`, lead should not be treated as pre-invite in sequence conditions.**
   - **Enforced**: `if_connected` condition checks connected-like stages in generate cron.
   - **Violated risk**: parallel update paths (enrich autocorrect, relation webhook) can race with stale reads.
   - **Fix**: single transition helper with optimistic concurrency (`updated_at` compare) and append-only transition log.

3. **Inbound message should move lead to responded regardless of whether conversation pre-existed.**
   - **Enforced**: only when `existingConv?.lead_id` exists in webhook handler.
   - **Violation**: new conversation path sets `leadId` from sender, but responded update uses `existingConv` only.
   - **Fix**: use resolved `leadId` (from existing OR newly created conversation) for stage/sequence updates.

4. **Action state machine should not strand records in `processing`.**
   - **Enforced**: send cron atomically updates validated→processing.
   - **Violation**: skipped actions due to anti-detection delay/working hours remain `processing` (never retried).
   - **Fix**: when skipped, revert to `validated` and preserve next-eligible timestamp.

5. **Sequence lead status vocabulary should be consistent.**
   - **Enforced**: types allow `responded`; cron/webhook use `replied`.
   - **Violation**: mismatch can break analytics and condition checks.
   - **Fix**: standardize to one value (`responded` or `replied`) across DB/types/code + migration backfill.

6. **Scoring parse contract must be strict and validated.**
   - **Enforced**: JSON.parse with code-fence stripping.
   - **Violation**: no schema validation before DB merge; malformed fields can corrupt `scoring_detail`.
   - **Fix**: zod schema for scoring output; reject/repair invalid payloads.

7. **Lead duplicate prevention should be DB-level, not app-level only.**
   - **Enforced**: app check by linkedin_url in createLead.
   - **Violation**: no unique index/constraint on `leads.linkedin_url`; race can create duplicates.
   - **Fix**: add unique index (possibly normalized URL hash) + conflict handling.

---

## 3) Prompt–code alignment audit

### Prompt sources discovered
- Active runtime defaults: `lib/ai/prompts/defaults.ts`.
- Legacy references/docs: `promtp V4/03_SCORING_v4_2.md`, `PROMPTS_ORCHESTRATOR.md`, `_archive/prompts/*`.

### Key mismatches

1. **Stage terminology mismatch**
- Prompts include `prospect|connected|replied` terminology.
- Runtime lead model and transitions use `to_invite|invited|connected|in_sequence|responded|meeting|closed`.
- Risk: LLM reasons with non-canonical stages, causing inconsistent scoring/generation behavior.

2. **Scoring output expectations are under-specified in parser**
- Route expects JSON fields like `score`, `detail`, `categorie`, `confidence`, etc. but parser has no schema guard.
- Prompt may drift and still parse as JSON but with missing keys.

3. **Conversational agent role overlap/conflict**
- `/api/ai/suggest` uses `conversational` agent with strict “return only message”.
- `/api/ai/chat` also uses `conversational` for dashboard assistant behavior.
- One agent ID handles two different responsibilities without explicit sub-mode prompt partitioning.

4. **Knowledge/ICP scope drift in docs vs implementation**
- Docs/history mention older mappings and older prompt versions.
- Runtime mapping is in `lib/rag/mapping.ts`; legacy docs can mislead operators changing prompts.

---

## 4) RAG pipeline audit

### Actual implemented pipeline
- Ingestion: static JSON files committed in `knowledge/` (manual/offline conversion).
- Chunking: none (section-level formatting only).
- Embeddings: none.
- Retrieval: agent→fixed block mapping (`lib/rag/mapping.ts`), with wildcard all blocks for conversational.
- Injection: formatted whole-block text appended to system prompt (`lib/rag/context.ts`).

### Findings

1. **Not true semantic retrieval**: every mapped block is fully injected; no relevance ranking.
2. **Cross-ICP contamination risk**: conversational agent gets all blocks (`'*'`), increasing chance of mixed guidance.
3. **Prompt injection surface**: user overrides in `user_rag_data` are injected as trusted system context without sanitization/provenance.
4. **No grounding/citation discipline in generation routes**: model outputs are not required to cite RAG fragments.
5. **RAG vs scoring potential divergence**: scoring relies on RAG + prompt wording, but no shared machine-readable scoring policy source.

### Single source-of-truth recommendation
- Introduce a **versioned policy spec** (JSON/YAML) for:
  - stage enum + transitions,
  - scoring rubric weights/thresholds,
  - ICP definition.
- Generate both prompt snippets and code enums/validators from this spec.

---

## 5) Data integrity & sync issues

### External sources identified
- Unipile APIs (accounts/chats/messages/users/invitations) via `lib/unipile/client.ts`.
- Unipile webhooks via `app/api/webhooks/unipile/route.ts`.
- Perplexity API for enrichment via `callPerplexity`.
- OpenAI/Claude APIs for generation/scoring/conversation.

### Race/staleness issues
1. **Webhook conversation race**: lead stage update on inbound uses `existingConv` only.
2. **Send cron processing lock leak**: skipped actions stay `processing` and are effectively dead.
3. **No transaction around coupled updates** (message insert + conversation update + lead stage + sequence_lead update).
4. **No idempotency keys on actions** beyond step existence checks; retries may duplicate in edge cases.
5. **App-level dedup only for lead linkedin URL**.

### Recommended boundaries
- DB function/transaction per webhook event for atomic multi-table updates.
- Add `idempotency_key` on `actions` (`user_id + sequence_id + step_id + lead_id + due_date`).
- Add reconciliation job:
  - reset stale `processing` actions older than threshold to `validated` or `failed_retriable`,
  - detect leads with `responded` but no inbound message,
  - detect sequence leads status-stage mismatches.

---

## 6) Dead code / unused features audit

### Likely unused (safe to remove or archive-hard)
1. `_archive/**` prompt/docs/code appears unused by runtime imports.
2. `promtp V4/03_SCORING_v4_2.md` appears historical (active prompt is in `lib/ai/prompts/defaults.ts`).

### Unused but should be used / cleaned up
3. `types/sequences.ts` `SequenceLeadStatus` includes `responded`; runtime writes `replied`.
4. Multiple docs (`PROMPTS_ORCHESTRATOR.md`, `DECISIONS.md`, `CLAUDE.md`) contain outdated mappings/stage names.

### Verification approach used
- Checked runtime imports and route call graph from `app/api/**` and `lib/**`.
- Searched repo references for stage/status vocab and prompt source locations.

---

## 7) Test plan + 10 highest-impact quick fixes

### a) Unit tests (invariants)
- Validate transition function allows only canonical lead stage transitions.
- Validate action status transitions (`pending→validated→processing→sent|failed`) and forbid terminal regressions.
- Validate sequence lead status vocabulary consistency.

### b) Property-based tests
- Generate random event sequences (invite sent, relation webhook, inbound msg, sequence send) and assert invariants:
  - no impossible stage combos,
  - stage monotonicity constraints,
  - action eventually terminal or reschedulable.

### c) Integration tests
- Full pipeline: enrichment → scoring → action generation → send execution → webhook inbound.
- Include concurrent webhook/send simulation for race detection.

### d) DB consistency checker script
- Query checks for:
  - stale `actions.status='processing'` older than X min,
  - leads `stage='responded'` with no inbound messages,
  - sequence_leads status inconsistent with lead stage,
  - duplicate linkedin_url.

### Top 10 fixes (priority: impact/effort)
1. **Fix send cron lock leak**: revert skipped `processing` actions to `validated` (+next eligible time).
2. **Fix webhook inbound stage update bug**: use resolved conversation lead ID, not `existingConv` only.
3. **Add DB CHECK constraints for stage/status enums** on leads/actions/sequence_leads.
4. **Unify `replied` vs `responded`** with migration + type/code alignment.
5. **Add unique index on normalized `linkedin_url`**.
6. **Introduce zod validation for scoring/enrichment JSON outputs**.
7. **Create centralized transition service** used by send/enrich/webhook paths.
8. **Add webhook transactional function** for message+conversation+lead+sequence updates.
9. **Split conversational agent into two IDs** (`assistant_ops` vs `reply_writer`) or explicit mode in prompt contract.
10. **Prompts/RAG contract tests**: snapshot tests asserting expected fields and canonical stage terms.

---

## Consistency Dashboard

| Invariant | Enforced where | Gap | Severity |
|---|---|---|---|
| Canonical lead stage vocabulary | TS unions (`types/leads.ts`) | Prompt/docs/runtime terms diverge (`prospect/replied` vs `to_invite/responded`) | High |
| Inbound msg -> responded | Webhook handler | Misses new-conversation lead path | High |
| Action processing should be retryable | send cron lock pattern | Skipped items can be stranded in `processing` | Critical |
| Sequence lead status consistency | some condition checks | `responded` vs `replied` mismatch | High |
| Lead dedup by linkedin URL | app-level check only | no DB unique constraint | Medium |
| Scoring payload integrity | JSON parse only | no schema validation before DB update | High |
| RAG relevance isolation | static mapping | conversational uses all blocks; no semantic retrieval | Medium |
| RAG trust boundary | user overrides table | no sanitization/provenance/citation policy | Medium |

