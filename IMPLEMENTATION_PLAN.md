# Brilina Forge AI — Implementation Plan

This plan applies to `blinkzdlfx-cell/Brilina-Forge-Ai`. Keep the existing Next.js/OpenNext Cloudflare deployment and Tavily web-search implementation unchanged while delivering the workspace roadmap.

## Baseline verified
- Next.js 16, React 19, TypeScript, Tailwind CSS v4, shadcn components, AI SDK.
- Cloudflare Workers deployment through OpenNext.
- Existing chat, ask-user tool, Tavily web-search tool, and a GitHub public-repository statistics tool.
- No Neon database persistence or authentication flow was found in the current application audit.
- Current CI at the start of this plan passed tests, lint, typecheck, and Worker build.

## Delivery rules
- Work in cohesive batches, not tiny disconnected changes.
- Each batch ends with tests, lint, typecheck, Worker build, CI result, a concise change summary, and simple user acceptance instructions.
- Use feature branches and pull requests for substantial batches; do not force-push or overwrite unrelated work.
- Do not make production schema changes or deploy secrets from source code.
- Do not change Tavily search behavior in these batches.
- If a required external account, OAuth app, Neon project, or secret is unavailable, implement and test the code/schema that can be safely prepared, then clearly identify the exact configuration still needed.

## Batch 0 — Baseline and design contract
- Preserve the current working chat template and deployment setup.
- Add and maintain this product spec, implementation plan, and agent workflow.
- Inventory routes, current components, dependencies, runtime constraints, and existing tests.
- Agree on the schema and authentication integration before applying any production database changes.

## Batch 1 — Workspace shell and design system
- Reuse installed Tailwind v4 and shadcn components; do not add a competing UI framework.
- Implement a coherent workspace shell: responsive conversation sidebar, sticky workspace/context header, central conversation area, fixed-bottom composer, icon actions, and repository/branch dialog.
- Establish shared spacing, surface, border, focus, and theme tokens.
- Ensure the sidebar and all controls are legible in both themes.
- Keep chat streaming, stop, retry, ask-user, tool rendering, and current model selection working.
- Add component-level behavior tests where the current test setup supports them.

## Batch 2 — Neon schema and server-side data layer
- Design versioned, non-destructive migrations for users/identity mapping, conversations, messages, workspace context, agent runs, and activity events.
- Add server-only database access using the pooled Neon connection string and a Worker-compatible driver/runtime configuration.
- Enforce ownership in every read and mutation; add indexes and foreign keys.
- Add migration verification and tests; do not reset or recreate a production schema.
- Keep local/dev and production migration instructions separate.

## Batch 3 — Authentication and protected routes
- Integrate GitHub sign-in through a supported auth library compatible with Next.js/OpenNext and Neon.
- Verify callback URLs, session handling, CSRF/state validation, cookie security, and required environment variables.
- Protect conversation, run, and repository mutation routes on the server.
- Add sign-out and unauthorized/error UI.
- Do not deploy until the OAuth app and required secrets are configured and the sign-in flow is tested.

## Batch 4 — Persistent conversations and run timeline
- Persist conversations and messages by authenticated user.
- Add create/list/open/rename/archive/delete semantics with ownership checks.
- Add run records and append-only activity events with status, timestamps, and structured metadata.
- Ensure refresh and navigation restore the correct conversation.
- Keep request history bounded for the Cloudflare Worker; load older messages from the database rather than resubmitting all history.

## Batch 5 — GitHub repository and branch foundation
- Replace the metadata-only GitHub tool with a server-side GitHub integration that uses the authenticated user's authorized repositories.
- Add repository search/selection, branch listing, tree browsing, file reading, recent commits, and diff/compare.
- Use least-privilege OAuth permissions and do not expose tokens to the browser.
- Store a repository/branch context snapshot per run: user, conversation, repository ID/full name, branch, and base commit SHA.
- Changing current UI context must never mutate a running job's snapshot.

## Batch 6 — Controlled code changes and verification
- Add plan, inspect, edit proposal, patch validation, branch creation, and commit/PR operations.
- Before writes, re-check user access and compare current branch head with the captured base SHA.
- Reject path traversal, unexpected binary files, oversized patches, and stale-base writes.
- Use GitHub Actions/CI for verification rather than executing arbitrary repository code in the Cloudflare Worker.
- Report changed files, diff, commit/PR, and actual check results.

## Batch 7 — Better tools and agent orchestration
- Define a typed tool registry with clear schemas, input validation, timeouts, cancellation, retry policies, and bounded step budgets.
- Separate read-only tools from mutation tools.
- Add durable run states and safe recovery for interrupted requests.
- Add activity UI tied to trusted tool events and require user clarification/approval for ambiguous or high-impact actions.
- Keep web search unchanged; additional tool work should focus on repository inspection, code changes, CI results, diff review, and conversation/workspace operations.

## Acceptance gate for every batch
1. Review the diff for scope and accidental unrelated changes.
2. Run unit tests.
3. Run ESLint.
4. Run TypeScript checks.
5. Build the Cloudflare Worker.
6. Confirm GitHub Actions status.
7. Report what is complete, what is blocked by account configuration, and how to test the batch.
