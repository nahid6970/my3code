# Move a thread to another project

Threads can be reassigned to another project in the same environment from the web or desktop thread menu. The project picker filters out the thread's current project and supports searching the remaining projects.

The web client dispatches the `thread.change-project` orchestration command. The server persists the updated project in its thread projection and emits `thread.project-changed`; the client applies that event to the open thread projection. The `t3_thread_organize` MCP tool also supports the `change_project` action with a `targetProjectId`.

The move action is handled by the shared thread actions used by both the sidebar context menu and the thread header menu. The picker is hosted from the web app root so both entry points use the same flow.
