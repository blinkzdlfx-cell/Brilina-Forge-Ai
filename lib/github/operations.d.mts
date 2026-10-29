export const BRANCH_PREFIX: string

export const LIMITS: Readonly<{
  maxCallsPerRequest: number
  maxFilesPerCommit: number
  maxCharsPerFile: number
  maxCharsPerCommit: number
  maxReadChars: number
  maxTreeEntries: number
  maxSearchResults: number
  maxLogChars: number
  maxEditableFileBytes: number
}>

export class PolicyError extends Error {
  constructor(message: string)
}

export type ToolResult = { ok: boolean; summary: string; content?: string; url?: string }

export type RepoAccess = { full_name: string; default_branch: string }

export type FileChange = {
  path: string
  content?: string
  delete?: boolean
  edits?: Array<{ oldText: string; newText: string }>
}

export function normalizeRepo(input: unknown): string | null
export function isAgentBranch(name: unknown): boolean
export function validateAgentBranch(name: string): string | null
export function validateRepoPath(path: string, options?: { allowWorkflowEdits?: boolean }): string | null
export function clipText(text: string, max: number): string
export function applyEdits(
  source: string,
  edits: Array<{ oldText: string; newText: string }>
): { ok: true; text: string } | { ok: false; error: string }
export function summarizeChecks(
  checkRuns: Array<{ name?: string; status?: string; conclusion?: string | null }>,
  combinedStatus: { state?: string; total_count?: number; statuses?: Array<{ context?: string; state?: string }> } | null
): { state: "none" | "pending" | "success" | "failure"; failing: string[]; pending: string[] }
export function extractErrorContext(log: string, maxChars?: number): string
export function encodePath(path: string): string

export type GithubOperations = {
  readonly callCount: number
  listRepositories(): Promise<ToolResult>
  getTree(input: { repo: string; ref?: string; path?: string }): Promise<ToolResult>
  readFile(input: { repo: string; path: string; ref?: string; startLine?: number; endLine?: number }): Promise<ToolResult>
  searchCode(input: { repo: string; query: string }): Promise<ToolResult>
  createBranch(input: { repo: string; branch: string; from?: string }): Promise<ToolResult>
  commitFiles(input: { repo: string; branch: string; message: string; changes: FileChange[] }): Promise<ToolResult>
  openPullRequest(input: { repo: string; head: string; title: string; body?: string; base?: string; draft?: boolean }): Promise<ToolResult>
  getPullRequest(input: { repo: string; number: number }): Promise<ToolResult>
  listWorkflowRuns(input: { repo: string; branch?: string }): Promise<ToolResult>
  getRunFailure(input: { repo: string; runId: number }): Promise<ToolResult>
  listIssues(input: { repo: string; state?: "open" | "closed" | "all"; labels?: string }): Promise<ToolResult>
  getIssue(input: { repo: string; number: number }): Promise<ToolResult>
}

export function createGithubOperations(config: {
  request: (path: string, options?: Record<string, unknown>) => Promise<unknown>
  repos: RepoAccess[]
  allowWorkflowEdits?: boolean
  maxCalls?: number
}): GithubOperations
