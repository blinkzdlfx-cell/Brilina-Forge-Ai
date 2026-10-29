import { ExternalLinkIcon } from "lucide-react"

import { type GithubToolPart } from "@/tools"
import { StatusIcon } from "@/components/status-icon"
import { CodeBlock, CodeBlockContent } from "@/components/ui/code-block"
import {
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace"

// [while running, when finished]
const LABELS: Record<string, [string, string]> = {
  gh_list_repos: ["Listing repositories", "Listed repositories"],
  gh_get_tree: ["Browsing files", "Browsed files"],
  gh_read_file: ["Reading", "Read"],
  gh_search_code: ["Searching code", "Searched code"],
  gh_create_branch: ["Creating branch", "Created branch"],
  gh_commit_files: ["Committing changes", "Committed changes"],
  gh_open_pr: ["Opening pull request", "Opened pull request"],
  gh_get_pr: ["Checking pull request", "Checked pull request"],
  gh_merge_pr: ["Merging pull request", "Merge result"],
  gh_list_runs: ["Listing CI runs", "Listed CI runs"],
  gh_run_failure: ["Reading CI failure", "Read CI failure"],
  gh_run_workflow: ["Starting workflow", "Started workflow"],
  gh_list_issues: ["Listing issues", "Listed issues"],
  gh_get_issue: ["Reading issue", "Read issue"],
  gh_create_issue: ["Creating issue", "Created issue"],
  gh_comment: ["Commenting", "Commented"],
}

function targetOf(input: unknown) {
  if (!input || typeof input !== "object") return ""
  const record = input as Record<string, unknown>
  const pick = (key: string) => (typeof record[key] === "string" ? (record[key] as string) : "")
  const detail = pick("path") || pick("branch") || pick("head") || pick("query") || (typeof record.number === "number" ? `#${record.number}` : "")
  return [pick("repo"), detail].filter(Boolean).join(" · ")
}

export function GithubActionPart({
  part,
  isStreaming,
}: {
  part: GithubToolPart
  isStreaming: boolean
}) {
  const name = part.type.replace(/^tool-/, "")
  const [running, finished] = LABELS[name] ?? ["Working with GitHub", "GitHub"]
  const target = targetOf(part.input)

  if (part.state !== "output-available") {
    const failed = part.state === "output-error" || !isStreaming
    return (
      <TraceCollapsible>
        <TraceCollapsibleTrigger disabled={!failed}>
          <TraceLine status={failed ? "error" : "running"}>
            <TraceIcon>
              <StatusIcon status={failed ? "error" : "running"} />
            </TraceIcon>
            <TraceTitle>
              {failed ? "GitHub action failed" : running}
              {target ? ` ${target}` : ""}
            </TraceTitle>
          </TraceLine>
        </TraceCollapsibleTrigger>
        {part.state === "output-error" && (
          <TraceCollapsibleContent>
            <CodeBlock size="sm" variant="destructive">
              <CodeBlockContent wrap className="max-h-64">
                {part.errorText}
              </CodeBlockContent>
            </CodeBlock>
          </TraceCollapsibleContent>
        )}
      </TraceCollapsible>
    )
  }

  const output = part.output as { ok: boolean; summary: string; content?: string; url?: string }

  return (
    <TraceCollapsible>
      <TraceCollapsibleTrigger>
        <TraceLine status={output.ok ? undefined : "error"}>
          <TraceIcon>
            <StatusIcon status={output.ok ? undefined : "error"} />
          </TraceIcon>
          <TraceTitle>{output.ok ? `${finished}${target ? ` ${target}` : ""}` : output.summary}</TraceTitle>
          {output.ok && <TraceDescription className="hidden sm:inline">{output.summary}</TraceDescription>}
        </TraceLine>
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent>
        <CodeBlock size="sm" variant={output.ok ? undefined : "destructive"}>
          <CodeBlockContent wrap className="max-h-64">
            {[output.summary, output.content].filter(Boolean).join("\n\n")}
          </CodeBlockContent>
        </CodeBlock>
        {output.url && /^https:\/\/github\.com\//.test(output.url) && (
          <a
            href={output.url}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Open on GitHub <ExternalLinkIcon className="size-3.5" />
          </a>
        )}
      </TraceCollapsibleContent>
    </TraceCollapsible>
  )
}
