# Thread Project Reassignment Feature

## Summary
Implemented backend support for moving threads between projects in T3 Code. Users can now reassign threads to different projects using the `t3_thread_organize` MCP tool.

## Implementation Details

### 1. Contracts (packages/contracts/src/orchestrationV2.ts)

**New Command:**
```typescript
Schema.Struct({
  type: Schema.Literal("thread.change-project"),
  commandId: CommandId,
  threadId: ThreadId,
  targetProjectId: ProjectId,
})
```

**New Event:**
Added `"thread.project-changed"` to both:
- `OrchestrationV2Event` literals (line ~2220)
- `OrchestrationV2JsonEvent` literals (line ~3180)

### 2. MCP Tool Definition (apps/server/src/mcp/toolkits/thread/tools.ts)

**Extended `t3_thread_organize` tool:**
- Added `"change_project"` to action literals
- Added `targetProjectId: Schema.optional(ProjectId)` parameter
- Updated description to include project moving functionality

### 3. MCP Handler (apps/server/src/mcp/toolkits/thread/handlers.ts)

**Handler logic:**
```typescript
case "change_project":
  if (input.targetProjectId === undefined) {
    return yield* new OrchestratorMcpFailure({
      code: "invalid_request",
      message: "change_project requires targetProjectId.",
    });
  }
  command = { ...common, type: "thread.change-project", targetProjectId: input.targetProjectId };
  break;
```

### 4. Orchestrator (apps/server/src/orchestration-v2/Orchestrator.ts)

**Command routing:**
- Added `"thread.change-project"` case to `commandThreadId()` switch (~line 670)

**Thread mutation:**
```typescript
case "thread.change-project": {
  return {
    ...thread,
    projectId: command.targetProjectId,
    updatedAt: now,
  };
}
```

**Event mapping:**
```typescript
case "thread.change-project":
  return "thread.project-changed" as const;
```

### 5. Frontend Components (apps/web/src)

**Context Menu (apps/web/src/components/threadActionMenu.logic.ts):**
- Added `"move-to-project"` to `ThreadActionMenuId` type
- Added menu item: `{ id: "move-to-project", label: "Move to project…", icon: "folder-input" }`

**Project Picker Dialog (apps/web/src/components/MoveThreadToProjectDialog.tsx):**
- React component with project selection UI
- Filters out current project
- Shows project icons, titles, and workspace paths
- Handles selection and confirmation

**MCP Tool Caller (apps/web/src/lib/moveThreadToProject.ts):**
- Utility function that calls `t3_thread_organize` with `change_project` action
- Uses local API RPC to invoke MCP tool
- Returns `AsyncResult` for error handling

## Usage

Agents can move threads between projects:

```typescript
await t3_thread_organize({
  environmentId: "env-123",
  threadId: "thread-456", // optional, defaults to current thread
  action: "change_project",
  targetProjectId: "project-789"
});
```

Users can move threads via UI:
1. Right-click on a thread in the sidebar
2. Select "Move to project…" from the context menu
3. Choose the target project from the dialog
4. Click "Move" to confirm

## What's Still Needed

### Integration with Sidebar (apps/web/src)
1. **Wire up the context menu handler**
   - In `Sidebar.tsx`, handle the "move-to-project" action
   - Open `MoveThreadToProjectDialog` when action is triggered
   - Pass thread reference and handle confirmation

2. **State refresh after move**
   - Refresh sidebar project groups after successful move
   - Update active thread if it was moved
   - Show success toast notification

### Example Integration Code
```typescript
// In Sidebar.tsx context menu handler
case "move-to-project":
  // Open dialog with thread reference
  setMoveThreadDialog({ open: true, threadRef });
  break;

// Dialog confirmation handler
const handleMoveThreadConfirm = async (targetProjectId: ProjectId) => {
  const result = await moveThreadToProject(threadRef, targetProjectId);
  if (result._tag === "Success") {
    // Refresh sidebar
    // Show success toast
    closeMoveThreadDialog();
  }
};
```

## Testing
- ✅ Backend type-checks pass
- ✅ Contracts compile successfully
- ✅ Server compiles successfully
- ✅ Frontend components created (MoveThreadToProjectDialog, moveThreadToProject utility)
- ✅ Context menu action added
- ⏳ Sidebar integration pending
- ⏳ End-to-end testing pending

## Related Files
- **Backend implementation**: Complete
- **Frontend components**: Complete (dialog + utility)
- **Frontend integration**: Needs Sidebar.tsx handler hookup
- **Documentation**: Updated recent.md, dev.md, and this file
