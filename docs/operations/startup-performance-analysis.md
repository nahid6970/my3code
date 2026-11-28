# Startup Performance Analysis & Optimization Roadmap

This document outlines the investigation into the startup CPU spike (100% CPU usage for 5–10 seconds upon app launch) and proposes targeted optimizations for future consideration.

## Identified Bottlenecks

### 1. Database Migrations & SQLite Hydration (`statev2.sqlite`)

- **What happens:** On server startup, the backend acquires the SQLite ownership lock (`server-owner.sqlite`), validates schema versions, executes pending migrations, and initializes persistence layers.
- **Impact:** If the user database contains extensive historical data, chat turns, or workflow projections, running these database integrity checks and migrations synchronously blocks the main execution loop during boot.

### 2. Workspace & Git Repository Discovery

- **What happens:** Both the server and workspace managers scan known directories, resolve project roots, and inspect git repository status (active branch, worktree status, uncommitted changes) across all registered projects on startup.
- **Impact:** Synchronously scanning large repositories or deeply nested folder structures saturates CPU threads.

### 3. Client-Side State Hydration & Reconciliation

- **What happens:** Upon initial WebSocket connection, the web/desktop client receives and processes the entire initial state payload (threads, projects, terminal states, search indexes, keybindings).
- **Impact:** Reconciling massive state atom graphs and rendering the initial component tree all at once can cause a heavy main-thread CPU spike and layout thrashing.

---

## Proposed Optimizations (Future Roadmap)

1. **Lazy & Non-Blocking Workspace/Git Scanning**
   - Defer heavy git status checks and workspace folder indexing until after the server has completed its initial handshake and responded to the client, or run them lazily when a project is expanded.

2. **Batched SQLite Projections**
   - Move non-critical startup projections and migrations into background worker tasks or run them incrementally during idle cycles rather than blocking the critical startup path.

3. **Incremental State Hydration**
   - Paginate or stream initial state payloads over WebSockets (prioritizing active threads and recent projects while lazily loading archived or distant items) to prevent client-side main thread lockup.

4. **Startup Profiling**
   - Use T3 Code's built-in startup profiler (`T3CODE_STARTUP_PROFILE_DIR`) to trace exact timing and identify precise function-level execution costs during boot.
