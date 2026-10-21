# Reusable AI Application Foundation Plan

**Repository:** `blinkzdlfx-cell/Brilina-Forge-Ai`  
**Baseline branch:** `main`  
**Baseline commit reviewed:** `1868d3e8cd8ef0fb1ef0b727116749797bb2bcca`  
**Status:** Audit based on repository source and configuration; not yet a full runtime/security audit.

## Goal

Keep the approved chat UI and convert the project into a reusable foundation for future AI applications. A future project should be able to clone the starter, change branding and feature configuration, supply its own secrets, and enable only the capabilities it needs.

## Current repository findings

### Existing foundation worth preserving

- Next.js 16 with React 19 and TypeScript.
- OpenNext Cloudflare adapter, deployed as a Cloudflare Worker.
- Tailwind CSS and shadcn-style reusable UI components.
- Theme provider and theme-aware floating header controls.
- Responsive chat shell, sidebar, composer, model selector, streamed assistant messages, tool rendering, and mobile keyboard handling.
- Server-side runtime environment lookup in `lib/runtime-env.ts`.
- CI currently runs unit tests, lint, TypeScript checks, and a Cloudflare Worker build.
- Existing server-side integrations include Cloudflare Workers AI, Tavily search, and a GitHub repository lookup tool.

### Current constraints and gaps

- Authentication is not implemented. The chat endpoint is publicly callable and the README already notes that this can consume provider quota.
- No user/session/database layer is currently configured in this repository.
- Conversation history is held in client memory; it is not persisted between visits.
- Branding and feature choices are not yet governed by a central application configuration.
- AI provider/model configuration and project-specific tools still live in the same application codebase; their boundaries need to remain explicit as the app grows.
- Production secrets must be configured independently in Cloudflare and local development. They must never be copied into a reusable starter.
- The existing UI is reusable as a starting point, but the repository is not yet a fully reusable starter until configuration, auth, provider boundaries, and setup documentation are completed.

## Recommended architecture

### 1. Shared application foundation

Keep these project-agnostic:

- Chat layout, message rendering, composer, sidebar, theme, responsive behavior, and shared UI primitives.
- Authentication UI and session-aware navigation.
- Central application metadata/branding configuration.
- Common API error handling, loading states, validation, and safe logging.
- Environment-variable documentation and deployment instructions.

### 2. AI capability layer

Keep model/provider calls behind server-side modules and a small stable interface. Model choices, attachment support, voice transcription, and persistent history should be independently configurable. Provider keys must remain server-side.

### 3. Optional integrations

GitHub repository access, coding-agent tools, web search, file operations, and other integrations should be modular capabilities. Disabling GitHub integration must not break the general chat interface or authentication.

## Authentication decision

Use **Better Auth + the existing Neon PostgreSQL service + Cloudflare Workers**, subject to a compatibility check against the exact Next.js/OpenNext/Workers versions before implementation. Do not add Cloudflare Access as the end-user authentication layer for this public product unless an internal-access requirement emerges.

Required initial sign-in methods:

- Email/password with email verification and password reset.
- Google OAuth.
- GitHub OAuth.

Implementation requirements:

- Server-side session verification for every protected API and page.
- Secure, HTTP-only session cookies with appropriate production settings.
- Explicit account-linking rules; never link identities solely because an email string matches without the provider verification and linking flow.
- Authentication must remain separate from GitHub repository authorization. Signing in with GitHub must not silently grant repository access.
- Use the existing Neon database if appropriate; avoid a second database or hosted auth vendor without a demonstrated need.
- Select an email delivery integration only after checking existing provider configuration and cost.

## Reuse/configuration plan

Create a typed central configuration for:

- Application name, description, logo, and theme defaults.
- Feature flags for authentication methods, voice input, web search, file attachments, conversation persistence, model selection, GitHub integration, and coding-agent tools.
- Provider availability and model defaults, without storing credentials in the configuration.

Configuration flags are a UI/product switch, not a security boundary. Server routes must independently enforce authorization and check required secrets.

## Voice transcription

The microphone feature should record audio in the browser and send it to a same-origin server endpoint. The server calls OpenAI's `whisper-1` transcription API using the server-only `OPENAI_API_KEY`. The transcript should be inserted into the composer for user review, not automatically submitted. Enforce upload limits, accepted MIME types, timeouts, safe errors, and never log recordings, transcripts, or credentials.

## Implementation order

1. Preserve the approved UI and add the reusable foundation document/configuration plan.
2. Add voice transcription behind a server endpoint and test it with an OpenAI key configured as a secret.
3. Implement Better Auth with all three requested sign-in methods and protect APIs.
4. Add explicit account/session UI and test authentication on desktop and a physical phone.
5. Extract reusable configuration/provider boundaries and prepare a clean starter repository.
6. Verify a fresh clone can build/deploy without Brilina-specific GitHub features enabled.
7. Continue with GitHub repository integration only after the authentication flow is verified.

## Acceptance criteria for a reusable starter

- The UI layout remains visually consistent with the approved version.
- Branding and optional capabilities can be changed centrally.
- The application builds and deploys to a separate Worker using that project's own secrets.
- Authentication protects server-side APIs, not just UI routes.
- GitHub repository tools can be disabled without breaking general chat.
- No production API keys, OAuth secrets, or database credentials are included in the template.
- CI passes, and a fresh clone setup is documented.
- Manual desktop and physical-phone tests are recorded separately from automated CI results.

## Out of scope for this batch

- Authentication implementation itself.
- Database-backed conversation history.
- GitHub repository operations and coding-agent execution.
- Creating/publishing a separate template repository before the current foundation has been verified.
