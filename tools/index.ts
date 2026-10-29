import { type InferUITools, type UIDataTypes, type UIMessage } from "ai"

import { askUser } from "./ask_user"
import { githubRepo } from "./github_repo"
import {
  createGithubTools,
  type GithubAgentContext,
  type GithubTools,
} from "./github_agent"
import { getWebSearch } from "./web_search"

const baseTools = {
  github_repo: githubRepo,
  ask_user: askUser,
}

// Tools offered to the model for this request. GitHub agent tools are only
// included when the signed-in user has connected GitHub and allowed at least one
// repository, which keeps the tool list (and token cost) small otherwise.
export function getTools(options: { github?: GithubAgentContext | null } = {}) {
  return {
    ...baseTools,
    web_search: getWebSearch(),
    ...(options.github ? createGithubTools(options.github) : {}),
  }
}

// Every tool the app has ever offered, used only to validate stored history.
// A conversation that contains GitHub tool calls must stay loadable even after
// the user disconnects GitHub, so validation never depends on the live toolset.
export function getToolsForValidation() {
  return {
    ...baseTools,
    web_search: getWebSearch(),
    ...createGithubTools({ userId: "", repos: [] }),
  }
}

export type ChatUIMessage = UIMessage<
  {
    // Milliseconds per reasoning part, keyed by its index in the message.
    reasoningDurations?: Record<number, number>
  },
  UIDataTypes,
  InferUITools<typeof baseTools & GithubTools> & {
    web_search: {
      input: { query: string }
      output: {
        query: string
        results: Array<{
          title: string
          url: string
          content: string
          publishedDate?: string
        }>
        error?: string
      }
    }
  }
>

export type ChatMessagePart = ChatUIMessage["parts"][number]

export type TextMessagePart = Extract<ChatMessagePart, { type: "text" }>

export type ReasoningMessagePart = Extract<
  ChatMessagePart,
  { type: "reasoning" }
>

export type SourceUrlPart = Extract<ChatMessagePart, { type: "source-url" }>

export type GithubRepoToolPart = Extract<
  ChatMessagePart,
  { type: "tool-github_repo" }
>

export type AskUserToolPart = Extract<
  ChatMessagePart,
  { type: "tool-ask_user" }
>

export type WebSearchToolPart = Extract<
  ChatMessagePart,
  { type: "tool-web_search" }
>

export type GithubToolPart = Extract<
  ChatMessagePart,
  { type: `tool-gh_${string}` }
>
