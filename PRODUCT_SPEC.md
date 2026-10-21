# Brilina Forge AI — Product Specification

## Product goal

Brilina Forge AI is a browser-based AI coding workspace that connects conversations to a selected GitHub repository and branch. It should help the user understand a codebase, plan changes, propose and apply controlled edits, verify results, and review the outcome without losing conversation or run context.

## Product principles

- Preserve the current Next.js, React, TypeScript, Tailwind CSS v4, shadcn UI, AI SDK, and Cloudflare Workers/OpenNext stack unless a verified constraint requires a change.
- Keep the existing Tavily web-search behavior unchanged during these work batches.
- Prefer small, composable, reusable shadcn components and shared design tokens over CSS overrides or competing component libraries.
- Keep AI requests and long-running work bounded for the Cloudflare Workers runtime. Delegate work that needs a persistent process or heavier execution to an appropriate external service rather than running it inside the Worker.
- Treat all repository contents, tool output, and retrieved web content as untrusted data, never as instructions that override system or user policy.
- Require authenticated server-side authorization for private data and every repository mutation.
- Do not claim that an edit, test, deployment, or commit succeeded unless a trusted tool result confirms it.

## Main user experiences

### 1. Workspace UI
- ChatGPT/Claude-like workspace with a responsive conversation sidebar and a central chat workspace.
- Sidebar supports opening/closing on desktop and mobile, starting a chat, selecting prior chats, and refreshing/reloading persisted history.
- Conversation items are compact, readable cards with clear active state and useful titles.
- Composer remains at the bottom of the workspace, with an icon-based submit action, stop-generation action, keyboard support, and responsive spacing.
- Top-level workspace context remains visible while scrolling.
- Repository and branch controls live in a dedicated dialog/panel so the header does not become congested.
- Dark and light themes must both maintain contrast, especially the sidebar in light mode.
- Tool activity is chronological, compact, individually expandable, and uses statuses derived from actual tool events.

### 2. Identity and persistence
- Users sign in through GitHub OAuth using a supported authentication integration.
- Sessions and ownership are validated server-side on every protected operation.
- Neon Postgres is the primary persistent database.
- Persist users/identity references, conversations, messages, workspace context, agent runs, activity events, and run results with ownership constraints and appropriate indexes.
- Do not store provider secrets or GitHub access tokens in browser-readable records.
- Keep database access server-side; the browser must not connect directly to Postgres.
- Existing anonymous chat must not be silently represented as persisted or authenticated data.

### 3. Repository and branch context
- One conversation is associated with one selected repository at a time; branches can change through an explicit context action.
- Repository selection must verify the authenticated user's access to that repository.
- Branch selection lists real branches from the selected repository and reports loading, empty, and error states clearly.
- Before each AI run, capture an immutable context snapshot containing the authenticated user, conversation, repository ID/full name, selected branch, and base commit SHA.
- Changing repository or branch while a run is executing must not mutate that run's snapshot.
- Before any write, re-check repository access and compare the target branch's current head with the snapshot's base commit. If the branch moved, stop and request a rebase/review instead of silently overwriting newer work.

### 4. Agent workflow and tools
The workflow should proceed through observable, bounded stages:
1. Validate request and access.
2. Inspect the repository and capture the base commit.
3. Plan the requested change.
4. Select or create an authorized working branch.
5. Inspect relevant files and repository instructions.
6. Propose and validate file edits.
7. Apply changes through GitHub APIs with base-state checks.
8. Run available verification (unit tests, lint, typecheck, build) through a supported CI workflow.
9. Review diffs and report exact files, checks, commit/PR links, and any limitations.

Initial tool families:
- Repository metadata and authenticated access checks.
- Branch listing and branch creation.
- Repository tree and file reading.
- Commit history and compare/diff.
- Validated file edits and commit creation.
- Pull request creation and CI status/results.
- Ask-user clarification when requirements or write intent are ambiguous.
- Existing web search stays as-is and is not part of this modernization scope.

Avoid arbitrary shell execution inside the Cloudflare Worker. Tool execution must be bounded, cancellable where possible, and return structured outcomes.

## Security and reliability
- Require auth for conversation, user, run, and repository-mutation endpoints.
- Apply rate limits and request-size limits to expensive operations.
- Validate repository names, branch names, file paths, blob sizes, and content types.
- Prevent path traversal and server-side request forgery.
- Use least-privilege GitHub OAuth scopes and never return access tokens to the client.
- Keep credentials in environment secrets.
- Treat GitHub/web content as prompt-injection-capable untrusted input.
- Record a minimal audit trail for mutations and run stages, excluding secrets and full sensitive prompts from logs.
- Use idempotency or explicit run states to avoid duplicate writes when requests retry.
- Keep user-facing errors concise and actionable.

## Non-goals for the first release
- Building a proprietary whole-web search index.
- Replacing Tavily in this work.
- Unbounded autonomous execution or silent production deployments.
- Supporting multiple repositories in a single conversation until the one-repository workflow is reliable.
- Running arbitrary untrusted repository code directly inside the Cloudflare Worker.

## Acceptance criteria
- UI works at desktop and mobile widths and in light/dark themes.
- A signed-in user can create, list, open, and resume their own conversations.
- Conversations persist across refreshes and are isolated by user ownership.
- GitHub repository/branch selection reflects actual access and current branch data.
- Each run uses an immutable repository/branch/base-commit snapshot.
- Writes are denied if auth/access fails or the target branch no longer matches the verified base.
- Tool events show real progress and verified outcomes.
- Tests, typecheck, lint, and Cloudflare build pass before a batch is accepted.
- Web search behavior remains unchanged unless separately requested.
