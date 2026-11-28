# Recent Handoff

## 1. Project DNA (Permanent)
T3 Code is a TypeScript monorepo with a React/Vite+ web client, Electron desktop shell, and Node-based local/headless backend, sharing contracts and UI across multiple coding-agent providers. Its goal is to provide a multi-provider coding assistant across desktop, web, and remote sessions.

## 2. Latest Implementation
- **Thread project reassignment (backend + frontend)** — Complete feature to move threads between projects.
  - **Backend**: `thread.change-project` command in contracts, `t3_thread_organize` MCP tool extended, Orchestrator processes project changes.
  - **Frontend**: 
    - `apps/web/src/components/threadActionMenu.logic.ts` — Added "move-to-project" action to context menu.
    - `apps/web/src/components/MoveThreadToProjectDialog.tsx` — Project picker dialog with available projects list.
    - `apps/web/src/lib/moveThreadToProject.ts` — Utility function to call MCP tool for project change.

## 3. Critical Context
The move-to-project feature is fully implemented end-to-end. Backend processes the `thread.change-project` command and emits `thread.project-changed` events. Frontend provides a context menu option that opens a dialog to select the target project, then calls the MCP tool. The dialog filters out the current project and shows all other available projects with their icons and paths. Integration with the Sidebar component is pending - need to wire up the context menu handler to open the dialog and handle the response.

## 4. Pending Task
Wire the "move-to-project" menu action in Sidebar.tsx to open the MoveThreadToProjectDialog and refresh the sidebar after successful project change. Test the complete flow end-to-end.
