import assert from "node:assert/strict"
import test from "node:test"

import {
  applyEdits,
  createGithubOperations,
  extractErrorContext,
  isAgentBranch,
  normalizeRepo,
  summarizeChecks,
  validateAgentBranch,
  validateRepoPath,
} from "../lib/github/operations.mjs"
import { compactOldToolOutputs } from "../lib/tool-output-compaction.mjs"

class FakeGithubError extends Error {
  constructor(status, message) {
    super(message)
    this.name = "GithubError"
    this.status = status
  }
}

const b64 = (text) => Buffer.from(text, "utf8").toString("base64")

function fakeGithub(overrides = {}) {
  const log = []
  const state = {
    files: { "src/app.ts": "export const a = 1\nexport const b = 2\n", "README.md": "# Hello\n" },
    branches: { main: "sha-main" },
    pr: { number: 7, state: "open", draft: false, merged: false, title: "Fix", html_url: "https://github.com/o/r/pull/7", head: { ref: "forge/fix", sha: "headsha", repo: { full_name: "o/r" } }, base: { ref: "main" }, mergeable: true, mergeable_state: "clean", changed_files: 1, additions: 2, deletions: 1 },
    checkRuns: [{ name: "ci", status: "completed", conclusion: "success" }],
    ...overrides,
  }
  const request = async (path, options = {}) => {
    log.push({ path, method: options.method ?? "GET", body: options.body })
    const method = options.method ?? "GET"
    const url = new URL(path, "https://api.github.com")
    const p = decodeURIComponent(url.pathname)
    let m
    if ((m = p.match(/^\/repos\/o\/r\/git\/ref\/heads\/(.+)$/))) {
      const sha = state.branches[m[1]]
      if (!sha) throw new FakeGithubError(404, "Not found, or the token cannot access it.")
      return { object: { sha } }
    }
    if (p === "/repos/o/r/git/refs" && method === "POST") {
      const name = options.body.ref.replace("refs/heads/", "")
      if (state.branches[name]) throw new FakeGithubError(422, "GitHub rejected the request: Reference already exists")
      state.branches[name] = options.body.sha
      return {}
    }
    if ((m = p.match(/^\/repos\/o\/r\/git\/commits\/(.+)$/)) && method === "GET") return { tree: { sha: `tree-of-${m[1]}` } }
    if (p === "/repos/o/r/git/trees" && method === "POST") {
      state.lastTree = options.body
      return { sha: state.noDiff ? options.body.base_tree : "newtree" }
    }
    if (p === "/repos/o/r/git/commits" && method === "POST") return { sha: "newcommitsha" }
    if ((m = p.match(/^\/repos\/o\/r\/git\/refs\/heads\/(.+)$/)) && method === "PATCH") {
      assert.equal(options.body.force, false)
      state.branches[m[1]] = options.body.sha
      return {}
    }
    if ((m = p.match(/^\/repos\/o\/r\/contents\/(.+)$/))) {
      const file = state.files[m[1]]
      if (file === undefined) throw new FakeGithubError(404, "Not found, or the token cannot access it.")
      return { type: "file", size: file.length, content: b64(file) }
    }
    if (p === "/repos/o/r/pulls/7" && method === "GET") return state.pr
    if (p === "/repos/o/r/pulls/7/merge" && method === "PUT") { state.merged = options.body; return { sha: "mergedsha" } }
    if (p === "/repos/o/r/pulls" && method === "POST") return { number: 8, title: options.body.title, html_url: "https://github.com/o/r/pull/8" }
    if (p.endsWith("/check-runs")) return { check_runs: state.checkRuns }
    if (p.endsWith("/status")) return { state: "pending", total_count: 0, statuses: [] }
    throw new Error(`Unhandled fake GitHub call: ${method} ${path}`)
  }
  return { request, log, state }
}

const repos = [{ full_name: "o/r", default_branch: "main" }]
const ops = (fake, extra = {}) => createGithubOperations({ request: fake.request, repos, ...extra })

test("repository names are normalized and validated", () => {
  assert.equal(normalizeRepo(" https://github.com/o/r.git "), "o/r")
  assert.equal(normalizeRepo("o/r/extra"), null)
  assert.equal(normalizeRepo("../etc"), null)
  assert.equal(normalizeRepo(42), null)
})

test("only forge/* branches are writable and names must be valid Git refs", () => {
  assert.equal(isAgentBranch("forge/fix-login"), true)
  assert.equal(isAgentBranch("main"), false)
  assert.equal(isAgentBranch("forge/"), false)
  assert.match(validateAgentBranch("feature/x"), /must start with "forge\/"/)
  assert.match(validateAgentBranch("forge/a..b"), /not a valid/)
  assert.match(validateAgentBranch("forge/a b"), /letters, numbers/)
})

test("path validation blocks traversal, .git and workflow files unless enabled", () => {
  assert.equal(validateRepoPath("src/a.ts"), null)
  assert.ok(validateRepoPath("../x"))
  assert.ok(validateRepoPath("/abs"))
  assert.ok(validateRepoPath("a//b"))
  assert.ok(validateRepoPath("a/.git/config"))
  assert.match(validateRepoPath(".github/workflows/ci.yml"), /disabled/)
  assert.equal(validateRepoPath(".github/workflows/ci.yml", { allowWorkflowEdits: true }), null)
})

test("applyEdits requires a unique exact match", () => {
  assert.deepEqual(applyEdits("a b c", [{ oldText: "b", newText: "X" }]), { ok: true, text: "a X c" })
  assert.match(applyEdits("a b b", [{ oldText: "b", newText: "X" }]).error, /more than once/)
  assert.match(applyEdits("a", [{ oldText: "z", newText: "X" }]).error, /not found/)
  assert.match(applyEdits("a", [{ oldText: "", newText: "X" }]).error, /must not be empty/)
})

test("check summary combines check runs and legacy statuses", () => {
  assert.equal(summarizeChecks([], { total_count: 0, statuses: [] }).state, "none")
  assert.equal(summarizeChecks([{ name: "ci", status: "completed", conclusion: "success" }], null).state, "success")
  assert.equal(summarizeChecks([{ name: "ci", status: "in_progress" }], null).state, "pending")
  const failed = summarizeChecks([{ name: "ci", status: "completed", conclusion: "success" }], { total_count: 1, statuses: [{ context: "vercel", state: "failure" }] })
  assert.deepEqual([failed.state, failed.failing], ["failure", ["vercel"]])
})

test("CI log extraction keeps the context around the first error and strips timestamps", () => {
  const log = ["2026-10-29T10:00:00.000Z start", ...Array.from({ length: 80 }, (_, i) => `2026-10-29T10:00:01.000Z line ${i}`), "2026-10-29T10:00:02.000Z ##[error]Process completed with exit code 1.", "2026-10-29T10:00:03.000Z after"].join("\n")
  const context = extractErrorContext(log)
  assert.match(context, /##\[error\]Process completed/)
  assert.doesNotMatch(context, /2026-10-29T/)
  assert.doesNotMatch(context, /^start/m)
})

test("repositories outside the allowlist are rejected before any GitHub call", async () => {
  const fake = fakeGithub()
  const result = await ops(fake).readFile({ repo: "evil/repo", path: "a" })
  assert.equal(result.ok, false)
  assert.match(result.summary, /not on the allowed list/)
  assert.equal(fake.log.length, 0)
})

test("readFile returns ranges and refuses unsafe paths", async () => {
  const fake = fakeGithub()
  const full = await ops(fake).readFile({ repo: "O/R", path: "src/app.ts" })
  assert.equal(full.ok, true)
  assert.match(full.content, /export const a/)
  const ranged = await ops(fake).readFile({ repo: "o/r", path: "src/app.ts", startLine: 2, endLine: 2 })
  assert.equal(ranged.content, "export const b = 2")
  const bad = await ops(fake).readFile({ repo: "o/r", path: "../secret" })
  assert.equal(bad.ok, false)
})

test("createBranch enforces the prefix and tolerates an existing branch", async () => {
  const fake = fakeGithub()
  assert.equal((await ops(fake).createBranch({ repo: "o/r", branch: "main2" })).ok, false)
  const created = await ops(fake).createBranch({ repo: "o/r", branch: "forge/x" })
  assert.equal(created.ok, true)
  assert.equal(fake.state.branches["forge/x"], "sha-main")
  const again = await ops(fake).createBranch({ repo: "o/r", branch: "forge/x" })
  assert.equal(again.ok, true)
  assert.match(again.summary, /already exists/)
})

test("commitFiles writes atomically without force and never touches default branches", async () => {
  const fake = fakeGithub({ branches: { main: "sha-main", "forge/x": "sha-x" } })
  const onMain = await ops(fake).commitFiles({ repo: "o/r", branch: "main", message: "m", changes: [{ path: "a.txt", content: "x" }] })
  assert.equal(onMain.ok, false)
  assert.equal(fake.log.filter((c) => c.method !== "GET").length, 0)

  const result = await ops(fake).commitFiles({
    repo: "o/r", branch: "forge/x", message: "Update",
    changes: [
      { path: "new.txt", content: "hello" },
      { path: "src/app.ts", edits: [{ oldText: "a = 1", newText: "a = 10" }] },
      { path: "README.md", delete: true },
    ],
  })
  assert.equal(result.ok, true, result.summary)
  const entries = fake.state.lastTree.tree
  assert.deepEqual(entries.find((e) => e.path === "new.txt"), { path: "new.txt", mode: "100644", type: "blob", content: "hello" })
  assert.match(entries.find((e) => e.path === "src/app.ts").content, /a = 10/)
  assert.equal(entries.find((e) => e.path === "README.md").sha, null)
  assert.equal(fake.state.branches["forge/x"], "newcommitsha")
})

test("commitFiles rejects ambiguous change definitions, duplicates and workflow edits", async () => {
  const fake = fakeGithub({ branches: { "forge/x": "sha-x" } })
  const base = { repo: "o/r", branch: "forge/x", message: "m" }
  assert.equal((await ops(fake).commitFiles({ ...base, changes: [{ path: "a", content: "1", delete: true }] })).ok, false)
  assert.equal((await ops(fake).commitFiles({ ...base, changes: [{ path: "a" }] })).ok, false)
  assert.equal((await ops(fake).commitFiles({ ...base, changes: [{ path: "a", content: "1" }, { path: "a", content: "2" }] })).ok, false)
  const workflow = await ops(fake).commitFiles({ ...base, changes: [{ path: ".github/workflows/ci.yml", content: "x" }] })
  assert.match(workflow.summary, /disabled/)
  assert.equal(fake.log.length, 0)
})

test("a failed edit aborts the commit before anything is written", async () => {
  const fake = fakeGithub({ branches: { "forge/x": "sha-x" } })
  const result = await ops(fake).commitFiles({ repo: "o/r", branch: "forge/x", message: "m", changes: [{ path: "src/app.ts", edits: [{ oldText: "nope", newText: "x" }] }] })
  assert.equal(result.ok, false)
  assert.match(result.summary, /not found/)
  assert.equal(fake.log.filter((c) => c.method !== "GET").length, 0)
})

test("no-op commits are reported instead of creating empty commits", async () => {
  const fake = fakeGithub({ branches: { "forge/x": "sha-x" }, noDiff: true })
  const result = await ops(fake).commitFiles({ repo: "o/r", branch: "forge/x", message: "m", changes: [{ path: "a.txt", content: "x" }] })
  assert.equal(result.ok, false)
  assert.match(result.summary, /no difference/)
})

test("merge is blocked without making a GitHub API call", async () => {
  const fake = fakeGithub()
  const result = await ops(fake).mergePullRequest({ repo: "o/r", number: 7 })
  assert.equal(result.ok, false)
  assert.match(result.summary, /cannot merge pull requests/)
  assert.equal(fake.log.length, 0)
  assert.equal(fake.state.merged, undefined)
})

test("edited output size is bounded before a Git tree write", async () => {
  const fake = fakeGithub({ branches: { "forge/x": "sha-x" }, files: { "large.txt": "a" } })
  const result = await ops(fake).commitFiles({
    repo: "o/r", branch: "forge/x", message: "m",
    changes: [{ path: "large.txt", edits: [{ oldText: "a", newText: "x".repeat(200_001) }] }],
  })
  assert.equal(result.ok, false)
  assert.match(result.summary, /exceed 200000 characters/)
  assert.equal(fake.log.some((call) => call.method === "POST"), false)
})

test("the per-request GitHub call budget stops runaway loops", async () => {
  const fake = fakeGithub()
  const limited = ops(fake, { maxCalls: 2 })
  await limited.readFile({ repo: "o/r", path: "README.md" })
  await limited.readFile({ repo: "o/r", path: "README.md" })
  const third = await limited.readFile({ repo: "o/r", path: "README.md" })
  assert.equal(third.ok, false)
  assert.match(third.summary, /maximum number of GitHub calls/)
})

test("unexpected errors never leak internals to the model", async () => {
  const result = await createGithubOperations({ request: async () => { throw new Error("secret token ghp_123 leaked") }, repos }).readFile({ repo: "o/r", path: "a" })
  assert.equal(result.ok, false)
  assert.doesNotMatch(result.summary, /ghp_123/)
})

test("old tool outputs are shortened but the latest turn and shapes stay intact", () => {
  const big = "x".repeat(5000)
  const toolPart = (content) => ({ type: "tool-gh_read_file", toolCallId: "c", state: "output-available", input: {}, output: { ok: true, summary: "s", content } })
  const messages = [
    { id: "1", role: "user", parts: [{ type: "text", text: "a" }] },
    { id: "2", role: "assistant", parts: [toolPart(big), { type: "text", text: "done" }] },
    { id: "3", role: "user", parts: [{ type: "text", text: "b" }] },
    { id: "4", role: "assistant", parts: [toolPart(big)] },
  ]
  const compacted = compactOldToolOutputs(messages, { maxChars: 100 })
  assert.ok(compacted[1].parts[0].output.content.length < 300)
  assert.equal(compacted[1].parts[0].output.ok, true)
  assert.equal(compacted[3].parts[0].output.content.length, 5000)
  assert.equal(messages[1].parts[0].output.content.length, 5000, "input must not be mutated")
  assert.equal(compacted[0], messages[0])
})
