# Recent Handoff

## 1. Project DNA (Permanent)

T3 Code is a TypeScript monorepo with a React/Vite+ web client, Electron desktop shell, and Node-based local/headless backend, sharing contracts and UI across multiple coding-agent providers. Its goal is to provide a multi-provider coding assistant across desktop, web, and remote sessions.

## 2. Latest Implementation

- **Settled thread bulk deletion** — The Settled shelf has Select all / Clear controls, supports existing Ctrl/Cmd-click and Shift-click selection, and exposes Delete selected for its selected threads. Bulk deletion uses the same permission checks, confirmation, per-thread deletion handling, and error toast as the context menu.
- **Thread project reassignment** — The web and desktop thread menus can move a thread to another project in the same environment. The searchable picker is shared by the sidebar and thread header.
  - The client dispatches `thread.change-project`; the server updates the persisted thread projection and emits `thread.project-changed`.
  - The MCP `t3_thread_organize` tool also supports `change_project` with `targetProjectId`.
  - The client projection reducer handles `thread.project-changed` so the open thread reflects the new project.
- **Documentation organization** — `dev.md` is the maintainer entry point, `recent.md` holds the latest handoff, and [docs/markdown-map.md](docs/markdown-map.md) explains where durable documentation belongs. The Windows build and headless backend guides now live under `docs/operations/` and `docs/user/` respectively.

## 3. Critical Context

The server projection store must persist `thread.project-changed` alongside the other thread update events. The sidebar and open-thread projections both need to apply the change or the thread may remain listed in its old project or leave the open view stale. Settled shelf selection is scoped to the loaded `settledThreads` collection.

## 4. Pending Task

Check whether the settled shelf should offer pagination-wide selection when older settled threads are loaded incrementally.
