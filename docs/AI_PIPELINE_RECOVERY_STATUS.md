# AI Pipeline Recovery Status — Historical Notes

**Status authority for the next phase:** `docs/NEXT_PHASE_PLAN.md`  
**Repository:** `blinkzdlfx-cell/Brilina-Forge-Ai`  
**Current main baseline reviewed:** `ee35aaef5dae79d4ab7fb695b9f3f1e133f47ea5` (2026-10-24)

This file preserves useful notes from recovery of an AI-pipeline plan that had previously been applied to the wrong repository. Its dated implementation checkpoints below are historical snapshots, not a reliable statement of current completion status. Re-check current `main`, CI, deployment status, and live behavior before using them to authorize work.

## Repository correction

The intended application repository is `blinkzdlfx-cell/Brilina-Forge-Ai`, a Next.js 16 + AI SDK + OpenNext Cloudflare Worker app. Earlier pipeline changes in `blinkzdlfx-cell/brilina-forge` must not be copied mechanically into this repository because its integration points differ.

## Architecture observations from the original recovery

- The chat route used AI SDK streaming APIs and the frontend used `useChat`; preserve native end-to-end streaming rather than buffering a complete response and faking chunks.
- Tavily is integrated through `tools/web_search.ts` and `lib/tavily-search.mjs`. Do not replace or duplicate it without evidence.
- The application has existing chat tools, bounded request/context handling, image support/configuration, and redacted diagnostic helpers. Verify their exact current implementation before changing them.
- Worker CPU time, wall-clock time, provider latency, payload size, and provider errors are separate signals. Do not diagnose CPU exhaustion from elapsed time alone.
- No historical CI result in this file proves the current production deployment or live provider/browser acceptance.

## Historical batch checkpoints

The original recovery plan grouped work into:
1. Native streaming and stream-contract verification.
2. Context bounds, reliability, observability, and image intelligence.
3. Tavily integration hardening.

Earlier notes reported CI runs and code changes for these batches, but also recorded that production deployment and live provider/browser testing had not been performed at that time. Those historical statements must not be treated as current status.

See:
- `docs/AI_PIPELINE_REQUIREMENTS.md` for reusable pipeline requirements and test categories.
- `docs/AI_PIPELINE_BATCH_PLAN.md` for the historical batch design.
- `docs/NEXT_PHASE_PLAN.md` for the current planned work: evidence-led CPU investigation, external-compute decision, incremental workload migration, and the Agent Workflow System.

## Rules for future work

- Start from current `main` and inspect the actual source before editing.
- Preserve existing UI, provider contracts, and working behavior unless a verified defect requires a change.
- Keep changes on a review branch and complete one small batch before starting another.
- Do not provision services, add dependencies, alter schemas, configure secrets, or deploy to production without explicit approval.
- Record changed files, commit SHA, CI evidence, deployment evidence, manual tests, and unverified items separately.
