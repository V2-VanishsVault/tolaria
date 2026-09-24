# Tolaria Connect

Engineering handoff and source of truth for a public ChatGPT/Codex integration
that preserves Tolaria's local-first Markdown authority.

## Mission

Make an authorized AI client able to work with a user's local Tolaria vault
through a marketplace-quality MCP integration, without turning a hosted service
into the system of record for vault contents.

The user's Markdown files remain authoritative on the user's device. Tolaria
continues to own vault semantics, filesystem access, note behavior, and local
authorization. Tolaria Connect supplies the public integration and relay path.

## Decisions and non-negotiables

- Target a public ChatGPT/Codex marketplace integration, while retaining a
  useful local-development and private-install path.
- Preserve local-first behavior: vault contents are not copied to a hosted
  database as a prerequisite for using the integration.
- Prefer a public HTTPS MCP gateway plus an outbound, authenticated desktop
  relay. The desktop must not require inbound ports, router changes, public
  localhost exposure, or manual tunnel configuration for ordinary users.
- Reuse Tolaria's existing `mcp-server/tool-service.js`. Do not create a
  second implementation of vault operations.
- Keep reads and writes explicit and separately authorizable. Host confirmation
  and permission policy must be able to distinguish mutations from retrieval.
- Keep the public plugin ontology-neutral. It should learn a particular vault
  through `vault_context`, the vault's `AGENTS.md`, and the tools exposed by
  that vault; it must not embed Vanish-specific types or assume one vault's
  folder structure.
- Treat this document as a planning handoff, not authorization to modify
  unrelated Tolaria behavior.

## Target architecture

```text
ChatGPT / Codex
       │ public MCP over HTTPS
       ▼
Tolaria Connect gateway
       │ authenticated, routed relay session
       ▼  (outbound connection from desktop)
Tolaria desktop
       │ relay adapter / local authorization
       ▼
existing mcp-server/tool-service.js
       ▼
local Markdown vault
```

`tool-service.js` is the semantic boundary. Existing stdio MCP and WebSocket
paths already use it; Connect should add an adapter around the same service:

```text
                    ┌── stdio → local MCP clients
                    │
tool-service.js ────┼── WebSocket → existing desktop bridge
                    │
                    └── relay adapter → Tolaria Connect gateway
```

The relay carries authenticated requests and responses, not durable vault
state. The gateway should know only what is required to authenticate, route,
rate-limit, observe, and terminate a session.

## Repository responsibilities

### Tolaria fork

The fork remains a fork of the Tolaria application and should stay suitable for
eventual upstream contribution. It owns changes that belong inside the desktop
product:

- device identity and key storage
- explicit connection and pairing UI
- outbound relay lifecycle, reconnect, and status
- local permission and vault-selection controls
- relay transport adapter into `tool-service.js`
- device revocation and user-visible diagnostics

Avoid coupling this repository to Internet deployment, marketplace packaging,
or gateway account infrastructure.

### Future `tolaria-connect` repository

Create this as a separate repository when the desktop seam is proven. It owns:

- public HTTPS MCP gateway and connection routing
- authentication, pairing/session protocol, rate limits, and monitoring
- shared protocol schemas and compatibility rules
- ChatGPT/Codex marketplace plugin metadata and ontology-neutral skills
- gateway, plugin, protocol, security, privacy, and pairing documentation

The gateway and plugin have independent release lifecycles from Tolaria.

## Security and privacy principles

- Keep device private keys local; use short-lived, scoped credentials for relay
  sessions and support explicit revocation.
- Make pairing visible, deliberate, and recoverable. Never silently register
  third-party configuration or expose a vault at startup.
- Scope every request to an explicitly authorized device and vault. Validate
  paths and tool arguments at the desktop boundary before filesystem access.
- Treat relay and gateway logs as sensitive. Do not log note content, tokens,
  private keys, or unnecessary identifiers; define retention before deployment.
- Use TLS for public transport, authenticate both the client session and the
  desktop relay, rate-limit gateway access, and fail closed on expired or
  revoked credentials.
- Mark tools and protocol operations as read-only or mutating. Require host or
  user confirmation for writes where the client supports it.
- Assume prompt injection, malicious vault content, replay, confused-deputy
  routing, and compromised gateway credentials are real threats. Minimize
  authority, make actions observable, and provide disconnect/revoke controls.

## OpenAI marketplace constraints to verify

The prior planning conversation established these as implementation constraints
and verification points, not as a substitute for checking the current product
documentation and the actual target account:

- The integration should be packageable for ChatGPT and Codex marketplace use,
  with skills/instructions around MCP tools rather than a second vault engine.
- A public HTTPS MCP endpoint or an officially supported tunnel/relay may be
  required for ChatGPT to reach a private local server. Direct local stdio
  access from an ordinary desktop plugin was not established and must not be
  assumed.
- Plugin packaging does not bypass host, workspace, plan, confirmation, or
  MCP permission controls. In particular, read/write availability and the
  native desktop experience must be tested against the current account.
- Earlier OpenAI sources were described as inconsistent about Pro write access
  and about web versus native-desktop availability. Resolve this with current
  official documentation and a real smoke test before committing to product
  claims.
- Writes must remain explicit and confirmation-aware even if the target client
  permits them; marketplace approval and security review should assume hostile
  inputs and accidental model mutations.

## Staged roadmap

### Stage 0 — inspect before modifying

Map the current implementation and identify the smallest stable insertion point.
Do not start with OAuth, marketplace submission, pairing screens, or cloud
infrastructure.

### Stage 1 — fake-relay vertical slice

Prove the central architectural assumption with a local fake relay:

```text
fake relay ↔ Tolaria desktop → existing tool-service → test vault
```

The acceptance scope is exactly:

1. one read operation, `read_note`;
2. one write operation, `create_note`;
3. read-back verification from the test vault;
4. authorization/error behavior for an invalid or disconnected session.

The slice must preserve existing direct transports and must not duplicate vault
logic.

### Stage 2 — real desktop transport

Define the relay protocol, device identity, pairing/revocation model, reconnect
behavior, vault scoping, and settings UX. Keep the gateway replaceable while
the protocol is exercised locally.

### Stage 3 — gateway and protocol repository

Implement the public HTTPS gateway, session routing, operational safeguards,
protocol schemas, and integration tests. No durable note-content storage unless
a later, explicit decision changes the local-first boundary.

### Stage 4 — neutral plugin and marketplace readiness

Package the connection and ontology-neutral workflows, document supported
client behavior, complete threat/privacy review, and validate reads/writes with
the actual supported ChatGPT and Codex surfaces before making availability
claims.

## Repository inspection checklist

- Read repository and nested `AGENTS.md`/contributor instructions.
- Inspect `mcp-server/tool-service.js` and its tests.
- Inspect the stdio MCP entry point and lifecycle management.
- Inspect `mcp-server/ws-bridge.js` and the existing WebSocket protocol.
- Trace Tauri/backend startup and shutdown behavior.
- Inspect settings storage, settings UI, and existing external-AI setup flows.
- Find how vault paths, permissions, and active-vault changes reach MCP tools.
- Inspect tests for MCP tool execution, vault lifecycle, WebSocket behavior, and
  error handling.
- Record the current tool names, input/output contracts, and read/write
  semantics before proposing a relay protocol.
- Check relevant ADRs, especially the local-first filesystem and least-
  privilege external-AI decisions.

## Unresolved questions

1. Which persistent transport is best for the outbound relay: WebSocket,
   streaming HTTP/2, or another officially supported option?
2. What exact pairing, credential rotation, device revocation, and multi-device
   model provide least privilege without making recovery impossible?
3. How should a user select and authorize one vault when multiple vaults are
   mounted or registered?
4. Which gateway metadata is necessary for routing and support, and what is the
   minimum retention policy?
5. Which MCP annotations and confirmation semantics are supported consistently
   across ChatGPT web, ChatGPT Desktop, and Codex?
6. Is an official public gateway required for marketplace review, or is a
   supported private relay/tunnel sufficient during development and testing?
7. What compatibility/version negotiation is needed between the Tolaria fork,
   gateway, and plugin?
8. Which parts should eventually be proposed upstream to Tolaria, and which
   remain Connect-specific?

## First Codex Task

Use this exact starter prompt in a new Tolaria project session:

> Read `docs/TOLARIA-CONNECT-PROJECT.md` and all applicable repository
> instructions, including `AGENTS.md` and relevant ADRs. Make no code changes
> yet. Inspect the current `mcp-server/tool-service.js`, stdio MCP entry point,
> WebSocket bridge, Tauri/backend lifecycle, settings implementation, and MCP
> and tool-execution tests. Produce an implementation-oriented architecture map
> of the current system and recommend the cleanest relay-transport insertion
> point for Tolaria Connect, explaining why it preserves existing vault
> semantics and which boundaries/tests should be used for the first fake-relay
> vertical slice. Record assumptions and open questions, but do not modify code.
