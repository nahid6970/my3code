# Recent Handoff

## 1. Project DNA (Permanent)
T3 Code is a TypeScript monorepo with a React/Vite+ web client, Electron desktop shell, and Node-based local/headless backend, sharing contracts and UI across multiple coding-agent providers. Its goal is to provide a multi-provider coding assistant across desktop, web, and remote sessions.

## 2. Latest Implementation
- `apps/web/src/components/chat/TimelineMinimap.tsx` — dense dot clicks resolve to the nearest rail position; blue marks current, hovered, and visible turns.
- `apps/web/src/components/chat/MessagesTimeline.logic.ts` — adaptive 112–320px rail, 6px endpoint inset, matching click-position mapping.
- `apps/web/src/components/chat/MessagesTimeline.tsx` — visible-turn detection uses rendered row bounds; after `scrollToIndex`, corrects target alignment and ignores stale navigation completions.
- `C:\Users\nahid\delta\md\t3code-windows-build.md` and `C:\Users\nahid\delta\md\t3-backend-guide.md` — documented sidebar settings and timeline navigator behavior.

## 3. Critical Context
The timeline uses LegendList virtualization. Minimap items map user turns to `MessagesTimelineRow` indices; buffered indices can include offscreen rows, so visibility must use DOM row/viewport intersection. Compressed 24px dot hit areas overlap in long chats; keep pointer selection based on rail Y, and preserve the 6px edge inset in both dot placement and pointer mapping. Navigation scrolls to the virtual row, then measures it after `scrollToIndex` settles. Lint and web typecheck passed; no tests were run. Windows build notes and preflight workarounds are in the linked build guide.

## 4. Pending Task
Manually validate dot selection and message alignment in the running app, especially the first/last turns and dense rails in long conversations.
