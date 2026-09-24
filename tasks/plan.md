# Implementation Plan: Tolaria Connect Stage 1

## Overview

Prove that both supported client paths use Tolaria's existing vault semantics:
direct local stdio for Claude Code and a future authenticated relay for
ChatGPT, without copying note content into a hosted service or changing the
existing stdio and loopback WebSocket transports.

## Architecture decisions

- Keep `mcp-server/tool-service.js` as the only semantic boundary for vault
  reads, writes, active-vault scoping, and UI intents.
- Treat the existing vault-neutral stdio MCP entry point as the direct-local
  integration path for Claude Code; do not force Claude through the relay.
- Add the first relay seam as an injected, transport-neutral adapter with a
  local fake protocol for the ChatGPT-oriented path. Do not introduce gateway
  or marketplace infrastructure in the Tolaria fork.
- Model session authentication and connection state at the adapter boundary;
  reject requests before dispatch when either is invalid or disconnected.
- Keep the first slice limited to `read_note` and `create_note`, then verify
  read-back from the same test vault.

## Task list

### Phase 1: Stage 0 inspection

- [x] Map current MCP, WebSocket, Tauri lifecycle, vault, and permission
  boundaries in `docs/TOLARIA-CONNECT-ARCHITECTURE-MAP.md`.
- [x] Record the implementation sequence and acceptance criteria in this plan.
- [x] Confirm the existing stdio MCP path and lifecycle tests as the Claude Code
  direct-local foundation.

### Phase 2: Stage 1 fake-relay vertical slice

- [x] Add a relay adapter with explicit connect/disconnect and credential
  validation, delegating `read_note` and `create_note` to an injected tool
  service.
- [x] Add integration-style Node tests covering read, create, read-back,
  invalid credentials, disconnected sessions, and unknown tools.
- [x] Run focused MCP tests, lint, type/build checks, and the repository’s
  applicable quality gates; confirm direct stdio, loopback WebSocket, and
  existing tool semantics remain unchanged.

### Checkpoint: Stage 1

- [ ] Fake relay can read and create through `tool-service.js` against a
  disposable vault.
- [ ] Invalid or disconnected sessions cannot reach the tool service.
- [ ] No durable relay or hosted vault state is introduced.
- [ ] Claude Code can continue using direct local stdio independently of the
  relay path.

## Current implementation evidence

- Stage 1 adapter implemented in `mcp-server/relay-adapter.js`.
- Stage 1 tests implemented in `mcp-server/relay-adapter.test.js` and included
  in the MCP package test script.
- MCP package suite: 69/69 tests passed.
- Root lint and build: passed.
- Root Vitest/coverage lanes: not release-clean in this environment; they
  reported unrelated existing failures in `src/App.test.tsx` and
  `src/components/WikilinkChatInput.test.tsx` before long-running shards were
  stopped.
- Local Codacy JavaScript/security/complexity tools reported zero findings for
  the new files. The configured PMD and Pylint tools also ran against the JS
  files and reported language-mismatch findings; no unrelated analyzer
  configuration was changed.
- CodeScene CLI/MCP remains unavailable. Repository-owner approval to proceed
  under the documented analyzer exception was given in the task conversation;
  final release verification still requires restoring CodeScene access.

### Phase 3: Stage 2 preparation

- [ ] Review the proven seam and decide the persistent outbound transport.
- [ ] Define protocol, device identity, pairing, revocation, vault scope, and
  reconnect requirements in a follow-up ADR before implementing desktop UX.

## Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Relay duplicates vault behavior | Divergent security and note semantics | Inject and call `createMcpToolService`; no filesystem calls in the adapter |
| A local fake protocol becomes an accidental public contract | Gateway rework or unsafe assumptions | Label the protocol test-only and defer final schema/versioning |
| Write calls bypass confirmation policy | Unexpected local mutations | Keep write dispatch separately classified and require authenticated session state |
| Existing local transports regress | Current MCP clients break | Add adapter tests without changing stdio/loopback protocol paths; run existing MCP suite |

## Open questions

- Which persistent outbound transport and authentication scheme should Stage 2
  use for the ChatGPT path?
- How should the Claude Code plugin/package discover and validate the existing
  direct stdio registration across supported desktop environments?
- How should read and write capabilities be represented and confirmed across
  ChatGPT, Codex, and the desktop host?
- What minimal gateway metadata and retention policy are acceptable?
