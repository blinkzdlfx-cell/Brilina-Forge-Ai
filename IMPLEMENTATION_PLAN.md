# Brilina Forge AI — Implementation Plan

This plan applies to `blinkzdlfx-cell/Brilina-Forge-Ai`. Keep the existing Next.js/OpenNext Cloudflare deployment and Tavily web-search implementation unchanged while delivering the workspace roadmap.

## Baseline verified
- Next.js 16, React 19, TypeScript, Tailwind CSS v4, shadcn components, AI SDK.
- Cloudflare Workers deployment through OpenNext.
- Existing chat, ask-user tool, Tavily web-search tool, and a GitHub public-repository statistics tool.
- The current application code does not yet connect its chat UI to Neon persistence or an authenticated session.
- A Neon project named `Brilina Forge` already exists (`nameless-haze-58360399`) with a `production` branch. Neon Auth is already provisioned there through managed Better Auth; email/password and a shared Google provider are configured, but GitHub OAuth is not configured.
- The existing production database already contains Forge-related tables for identities/sessions, users, workspaces/members, conversations/messages, repositories, runs, tool calls, GitHub OAuth connections, GitHub App installations, and usage records. Do not create duplicate tables or reset the schema.
- The current `runs` schema records repository and branch snapshots but does not include the required immutable base commit SHA. This needs a versioned, additive migration after the existing schema and available test branches are audited.
- Several prior test/recovery branches already exist in Neon. Inspect their current state before creating another; never apply experimental migrations directly to `production`.
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

## Batch 2 — Existing Neon schema audit and server-side data layer
- Map the existing production schema and compare it with the app's intended data model before writing migrations. Reuse existing tables and constraints where possible; do not create duplicate users/conversations/runs tables.
- Inspect the existing disposable test/recovery branches and choose a safe test target before any schema mutation.
- Add server-only database access using the pooled Neon connection string and a Worker-compatible driver/runtime configuration.
- Add only missing, versioned, additive schema changes. The immutable run context must include a base commit SHA; verify whether a compatible field or equivalent exists before adding one.
- Enforce user/workspace ownership in every read and mutation; add indexes/foreign keys only when the audit shows they are missing.
- Test migrations and queries on a non-production branch. Keep production migration instructions separate and require explicit confirmation before applying production changes.

## Batch 3 — Authentication and protected routes
- Integrate the existing Neon-managed Better Auth service with the Next.js/OpenNext app rather than introducing a second auth system.
- Configure GitHub OAuth for the intended `Continue with GitHub` flow only after the GitHub OAuth client ID/secret and trusted callback URL are available. The current Neon Auth config has email/password and a shared Google provider, but no GitHub provider.
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
