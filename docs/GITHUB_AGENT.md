# GitHub coding agent

Brilina Forge works as a normal streaming chat first. When a user connects GitHub and allows at least one repository, the same chat gains coding-agent tools that run **through the GitHub API** (no local machine, no extra hosting, no paid service).

## Setup (once)

1. Apply `supabase/migrations/20261029000000_github_plugin.sql` only after the database change has been reviewed and explicitly approved for that environment. This branch does not apply it to a live database.
2. Server env vars: `SUPABASE_SERVICE_ROLE_KEY` is required. `GITHUB_TOKEN_ENCRYPTION_KEY` is optional; when absent the plugin derives a key from the service-role key. Set a dedicated random 32-byte key for stronger key separation and configure it consistently across deployments.
3. In the app: **Settings → Plugins · GitHub**. Paste a fine-grained personal access token, then pick repositories.
   - Use a fine-grained PAT restricted to selected repositories. Required repository permissions: Contents RW, Pull requests RW, Actions R, Metadata R. The token must have push access to any repository added to the allowlist.
   - Optional OAuth sign-in: create a GitHub OAuth App with callback `https://<domain>/api/github/oauth/callback` and set `GITHUB_OAUTH_CLIENT_ID` / `GITHUB_OAUTH_CLIENT_SECRET`.
4. Pick a tool-capable model. For agent work prefer **Gemini 2.5 Flash** (needs `GOOGLE_GENERATIVE_AI_API_KEY`); GLM 4.7 Flash works but follows long tool loops less reliably.

## What the agent can do

`gh_list_repos`, `gh_get_tree`, `gh_read_file`, `gh_search_code`, `gh_create_branch`, `gh_commit_files` (atomic multi-file commit with find/replace edits), `gh_open_pr`, `gh_get_pr` (state + CI), `gh_list_runs`, and `gh_run_failure` (failed step + bounded log excerpt for fix loops). Issues can be read, but the agent does not create issues or comments.

## Safety rules enforced in code (not just in the prompt)

| Rule | Where |
| --- | --- |
| Only allow-listed repositories; allowlist entries are re-verified with the user's own token (must have push access) | `operations.mjs` `resolveRepo`, `/api/github/repos` |
| Writes only on `forge/*` branches; never force-push; opens a PR for owner review | `validateAgentBranch`, `commitFiles`, `openPullRequest` |
| Agent cannot merge PRs or dispatch workflows; owner reviews and merges manually | The tool registry exposes neither operation |
| `.github/workflows/*`, `.git/*`, `..`, absolute paths blocked (workflow edits opt-in via env) | `validateRepoPath` |
| Best-effort in-memory cap of 120 GitHub calls per request; max 30 files / 600k changed/edit characters per commit | `LIMITS`, request-local counter |
| Tokens AES-GCM encrypted at rest, never returned to the browser, never logged; tool errors never leak internals | `crypto.ts`, `guarded()` |
| Repo content, issues and CI logs are treated as untrusted (prompt-injection warning in system prompt) | `agent-prompt.mjs` |

Pull requests remain open for owner review. The agent cannot merge them or trigger workflow dispatches. Workflow file edits are disabled unless `GITHUB_AGENT_ALLOW_WORKFLOW_EDITS=true`; enabling edits to workflow files can affect code that runs with repository secrets.

## Staying inside free tiers

- GitHub REST allows 5,000 requests/hour per user; the per-message cap keeps one run far below that.
- Each agent step is one model request. `GITHUB_AGENT_MAX_STEPS` (default 20) bounds it. Workers AI free allowance is small (10k neurons/day); Gemini free tier is far larger for this use.
- Tool definitions are only sent when GitHub is connected with ≥1 repo.
- Older tool outputs (file bodies, logs) are shortened to ~1.2k chars before being replayed to the model (`lib/tool-output-compaction.mjs`), so long conversations stay cheap. The stored conversation is untouched.
- Auto-resume after a step-limit stop is disabled; only answering an `ask_user` question resumes automatically. Say "continue" to resume a long task.

## Known limits

- The agent cannot execute code or tests itself; GitHub Actions is the test runner (it reads failures with `gh_run_failure` and pushes fixes).
- Code search covers the default branch only and is rate-limited by GitHub.
- Files over ~1 MB and binary files cannot be read/edited through the agent.
- "Background" (Netlify) tasks run plain chat without GitHub tools. Netlify needs `NETLIFY_WORKER_SECRET` set identically on Vercel and Netlify, plus the same Supabase/model keys, if you use background mode.
