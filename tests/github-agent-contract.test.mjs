import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import { shouldAutoSendAfterToolAnswer } from "../lib/auto-send.mjs"
import { buildGithubAgentInstructions } from "../lib/github/agent-prompt.mjs"

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8")

test("auto-send only fires after the user answers ask_user", () => {
  const msg = (parts) => [{ role: "assistant", parts }]
  assert.equal(shouldAutoSendAfterToolAnswer(msg([{ type: "tool-ask_user", state: "output-available" }])), true)
  assert.equal(shouldAutoSendAfterToolAnswer(msg([{ type: "tool-ask_user", state: "input-available" }])), false)
  // A run that ended on a server tool (step budget hit) must NOT restart itself.
  assert.equal(shouldAutoSendAfterToolAnswer(msg([{ type: "tool-gh_read_file", state: "output-available" }])), false)
  assert.equal(shouldAutoSendAfterToolAnswer(msg([{ type: "tool-ask_user", state: "output-available" }, { type: "tool-gh_commit_files", state: "output-available" }])), false)
  assert.equal(shouldAutoSendAfterToolAnswer([{ role: "user", parts: [] }]), false)
  assert.equal(shouldAutoSendAfterToolAnswer([]), false)
})

test("agent prompt keeps PRs owner-reviewed and lists repos", () => {
  const repos = [{ full_name: "o/r", default_branch: "main" }]
  const prompt = buildGithubAgentInstructions(repos, { maxSteps: 20 })
  assert.match(prompt, /o\/r \(default branch: main\)/)
  assert.match(prompt, /Never merge a pull request or dispatch a workflow/)
  assert.match(prompt, /about 20\) per message/)
})

test("chat route wires GitHub tools, validation of stored history, and compaction", async () => {
  const route = await read("app/api/chat/route.ts")
  assert.match(route, /getAgentAccess\(auth\.user\.id\)/)
  assert.match(route, /getToolsForValidation\(\)/)
  assert.match(route, /compactOldToolOutputs\(context\.messages\)/)
  assert.match(route, /stopWhen: isStepCount\(toolStepLimit\)/)
  assert.match(route, /MAX_PARTS_PER_MESSAGE = 200/)
  assert.doesNotMatch(route, /requireMergeApproval/)
})

test("GitHub routes are authenticated, same-origin protected and never return tokens", async () => {
  for (const path of ["app/api/github/connection/route.ts", "app/api/github/repos/route.ts"]) {
    const source = await read(path)
    assert.match(source, /requireUser\(\)/)
    assert.doesNotMatch(source, /token_ciphertext|getGithubToken\([^)]*\)\s*\)\s*$/m)
  }
  const connection = await read("app/api/github/connection/route.ts")
  assert.match(connection, /isSameOrigin/)
  assert.doesNotMatch(connection, /Response\.json\(\{[^}]*token[^}]*\}\)/)
  const callback = await read("app/api/github/oauth/callback/route.ts")
  assert.match(callback, /cookie !== `\$\{state\}\.\$\{auth\.user\.id\}`/)
})

test("chat client keeps the regex and auto-resend fixes", async () => {
  const chat = await read("components/chat.tsx")
  assert.match(chat, /split\(\/\\s\+\/\)/)
  assert.match(chat, /shouldAutoSendAfterToolAnswer/)
  assert.doesNotMatch(chat, /sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,/)
})
