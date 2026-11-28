# T3 Code Development Guide

## Project overview

T3 Code is a TypeScript monorepo for a multi-provider coding assistant. It shares contracts and React UI across a Vite+ web client, an Electron desktop app, and a Node-based local/headless server.

## Setup

- Use the repo-pinned toolchain: Node `26.13.1`, pnpm `12.14.0`, and Vite+ (`vp`).
- From the repository root, install dependencies with `vp i`.
- Read [recent.md](recent.md) for the latest implementation details and the next validation task.
- Windows setup and packaging notes: `C:\Users\nahid\delta\md\t3code-windows-build.md`.
- Backend installation and service notes: `C:\Users\nahid\delta\md\t3-backend-guide.md`.

## Common commands

Run commands from the repository root:

```powershell
vp run dev
vp run dev:web
vp run dev:desktop
vp run --filter @t3tools/web typecheck
vp lint
vp run dist:desktop:win:x64
```

For a failed Windows desktop build that needs inspection, add `--keep-stage`:

```powershell
vp run dist:desktop:win:x64 --keep-stage
```

The Windows build preflight requires its temporary directory to be outside any visible `node_modules` tree. If it reports that `%TEMP%` is beneath `C:\Users\nahid\node_modules`, set `$env:TEMP` and `$env:TMP` to `"$env:SystemRoot\Temp"` in the same PowerShell session, then retry. See the Windows build guide for the payload validation workaround and its tradeoffs.

## Architecture landmarks

- `apps/web/src/components/chat/` — shared conversation timeline, composer, turn navigation, and chat UI.
- `apps/web/src/components/sidebar/` — thread rows, project grouping, search results, and card details.
- `apps/web/src/components/settings/` — settings panels and client-side setting controls.
- `apps/server/` — local/headless backend.
- `apps/desktop/` — Electron shell and desktop packaging integration.
- `packages/contracts/` — shared schemas and settings contracts; update callers when changing a shared contract.

The chat timeline uses LegendList virtualization. Keep row indices aligned with the rendered `MessagesTimelineRow[]`; when working with visible content, distinguish the actual viewport from buffered rows. For timeline minimap navigation, preserve nearest-dot pointer selection, actual rendered-row visibility checks, and post-scroll target alignment.

## Change workflow

1. Trace the owning component and its logic/contracts before editing; follow nearby patterns.
2. Keep desktop and web behavior consistent when editing shared `apps/web` components.
3. Run focused lint/typecheck commands relevant to the change. Run tests when requested or when needed to validate a test-specific change.
4. Update `recent.md` with the latest files changed, implementation details, critical context, and one next task.
