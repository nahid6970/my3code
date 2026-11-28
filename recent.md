# Recent Handoff

## 1. Project DNA (Permanent)
T3 Code is a TypeScript monorepo with a React/Vite+ web client, Electron desktop shell, and Node-based local/headless backend, sharing contracts and UI across multiple coding-agent providers. Its goal is to provide a multi-provider coding assistant across desktop, web, and remote sessions.

## 2. Latest Implementation
- **Thread project reassignment** — The web and desktop thread menus can move a thread to another project in the same environment. The searchable picker is shared by the sidebar and thread header.
  - The client dispatches `thread.change-project`; the server updates the persisted thread projection and emits `thread.project-changed`.
  - The MCP `t3_thread_organize` tool also supports `change_project` with `targetProjectId`.
  - The client projection reducer handles `thread.project-changed` so the open thread reflects the new project.

## 3. Critical Context
The server projection store must persist `thread.project-changed` alongside the other thread update events. The sidebar and open-thread projections both need to apply the change or the thread may remain listed in its old project or leave the open view stale.

## 4. Pending Task
No pending implementation task for thread project reassignment.
