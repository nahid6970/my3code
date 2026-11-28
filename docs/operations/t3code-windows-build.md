# Build T3 Code for Windows (x64)

This is the end-to-end record of setting up and building the T3 Code source checkout at `C:\Users\nahid\t3code` on this PC.

## PC and result

- CPU: AMD Ryzen 5 3400G, 4 cores / 8 threads
- RAM: about 14 GB
- Free disk space when checked: about 278 GB
- Installer produced: `C:\Users\nahid\t3code\release\T3-Code-0.1.13-x64.exe` (latest rebuild: 212,437,419 bytes; about 203 MiB)
- The installer is an unsigned Windows `.exe` (NSIS), not an MSI.

## What was needed

- Git, to clone the repository.
- Vite+ (`vp`), which provides the project's pinned Node.js and package manager. The repo pins Node `26.13.1` and pnpm `12.14.0`.
- Rust (`rustup`, `rustc`, `cargo`) and the MSVC Rust target `x86_64-pc-windows-msvc`.
- Python 3 (Python 3.14.5 was present when checked).
- Visual Studio Build Tools 2022, with the x64/x86 MSVC compiler, Windows SDK, and x64 Spectre libraries. The full Visual Studio IDE and the broad C++ workload were not selected.

MSYS2/MinGW `g++` was present, but it does not replace MSVC for this project: the Windows build uses Rust's MSVC target and checks for MSVC, the Windows SDK, and Spectre libraries.

## Setup commands

### 1. Clone the repository

The checkout already existed at `C:\Users\nahid\t3code`. For a fresh checkout, the repo's Windows guidance recommends enabling Git long paths:

```powershell
git clone -c core.longpaths=true https://github.com/pingdotgg/t3code.git C:\Users\nahid\t3code
cd C:\Users\nahid\t3code
```

### 2. Install Vite+

```powershell
irm https://vite.plus/ps1 | iex
```

If `vp` is not recognized, reopen PowerShell. In this setup, `vp.exe` was found at `%LOCALAPPDATA%\vite-plus\bin\vp.exe` and Node was `v26.13.1`.

### 3. Install the minimal Visual Studio Build Tools components

This is the command used. It installs only the selected compiler, SDK, and Spectre component plus their installer-required dependencies; it does not install the Visual Studio IDE:

```powershell
winget install --exact --id Microsoft.VisualStudio.2022.BuildTools `
  --accept-package-agreements --accept-source-agreements `
  --override "--wait --quiet --norestart --add Microsoft.VisualStudio.Component.VC.Tools.x86.x64 --add Microsoft.VisualStudio.Component.Windows11SDK.26100 --add Microsoft.VisualStudio.Component.VC.Runtimes.x86.x64.Spectre"
```

The install was verified: `cl.exe`, the Windows SDK, and the x64 Spectre library directory were present.

### 4. Add the Rust MSVC target and install repo dependencies

The PC initially had Rust and Cargo, but only the GNU Rust target. Add the MSVC target required by this build, then install the JavaScript workspace dependencies:

```powershell
cd C:\Users\nahid\t3code
rustup target add x86_64-pc-windows-msvc
vp i
```

## Build command

The ordinary x64 Windows installer command is:

```powershell
vp run dist:desktop:win:x64
```

The equivalent direct script command used during troubleshooting was:

```powershell
node scripts/build-desktop-artifact.ts --platform win --target nsis --arch x64
```

## Build issues and fixes

### `EBUSY` while processing `T3 Code (Beta).exe`

The first attempt failed late in packaging when `electron-fuses` tried to open the staged app executable and Windows reported `EBUSY` (file busy/locked). T3 Code Nightly was closed before retrying. The next attempt got further and reached payload validation, so the later 104-file error was a separate issue. The log did not prove what held the executable lock.

### Payload contained 104 files; limit was 80

The normal build reached packaging, then failed Windows payload validation. The retained stage from `vp run dist:desktop:win:x64 --keep-stage` was `C:\Users\nahid\AppData\Local\Temp\t3code-desktop-win-stage-hYQ7JY`. Its `app\dist\win-unpacked` had 104 files, including 38 generated files under `resources\server-compile-cache`. The cache is prepared by `scripts/prepare-server-compile-cache.cjs` after Electron packaging. Without that cache, the package has 66 files and passes the 80-file limit.

The successful local build set `T3CODE_DESKTOP_UNTRUSTED_BUNDLE=true`. In the build code this both skips generation of the server bytecode cache and skips the packaged-bundle self-check. Only use it for source you trust. The app still runs without the prepared cache; startup may be slower while Electron compiles the server code itself.

PowerShell command that succeeded (the variable applies to this PowerShell process):

```powershell
cd C:\Users\nahid\t3code
$env:T3CODE_DESKTOP_UNTRUSTED_BUNDLE = 'true'
vp run dist:desktop:win:x64
```

To retain a failed package for inspection, pass `--keep-stage` directly after the Vite+ task name (do not insert a second `--`):

```powershell
vp run dist:desktop:win:x64 --keep-stage
```

The environment variable was set only for that PowerShell process; it was not saved permanently in Windows settings.

### Messages that were warnings, not the build failure

- “Platform-specific optional dependencies not bundled” listed packages for macOS, ARM, Linux, and other targets; those are not needed for this Windows x64 build.
- “No code signing certificate configured, signing is skipped” is expected for this local unsigned build. Windows may show a SmartScreen warning when running the installer.

## Output and installing

The successful build reported:

```text
C:\Users\nahid\t3code\release\T3-Code-0.1.13-x64.exe
C:\Users\nahid\t3code\release\T3-Code-0.1.13-x64.exe.blockmap
```

Run `T3-Code-0.1.13-x64.exe` to install the app. It is an installer, not a portable app to launch directly. The `.blockmap` file is an update-related sidecar, not the installer.

## Login, app data, and updates

- Sign into the coding agent/provider you want to use (such as Codex or Claude) through its normal setup. Those credentials are separate from building the app.
- T3 Connect sign-in is optional for local desktop use; it is used for remote access from a phone or browser.
- A local build uses the T3 app identity and may share app data with another installed T3 Code build. Do not assume it is isolated from T3 Code Nightly or another official build.
- The build script only adds a GitHub update feed when `T3CODE_DESKTOP_UPDATE_REPOSITORY` or `GITHUB_REPOSITORY` is set. A local build without one of those set likely will not auto-update; rebuild from newer source to update it.

## Restore the older model/reasoning/access controls

The desktop composer uses the shared web UI. The source change restores three separate composer controls, matching the older nightly screenshot in `C:\Users\nahid\Desktop\old_nightly`: a model picker, a reasoning-level picker, and an access/permissions picker. The newer combined model picker no longer shows the effort label beside the model or embeds the reasoning column in its popup. The access chip is inline after reasoning, even when it shows the default mode; it is no longer attached to the branch/context strip below the composer.

### Files changed

- `apps/web/src/components/chat/ComposerControlsBar.tsx` assembles the controls. It renders `ComposerReasoningControl` as its own adaptive footer block, removes the reasoning suffix and reasoning column from `ComposerModelPicker`, and assigns the `composer.effort` and `composer.mode` shortcuts to their visible controls. It keeps permissions in the model-picker footer only when the separate access control is hidden; otherwise permissions stay with the access control or overflow menu.
- `apps/web/src/components/ChatView.tsx` used to add `ComposerContextPermissions` as the trailing control in `BranchToolbar`, below the composer. That trailing control was removed so the access button is owned by `ComposerControlsBar` and appears directly after reasoning.
- `apps/web/src/components/chat/ChatComposer.tsx` no longer passes the `permissionsShownInStrip` flag, which previously hid the access chip when the context strip was visible.
- `apps/web/src/components/chat/ComposerModelEffort.tsx` adds and exports `ComposerReasoningControl`. It reuses `EffortLevels`, which reads the selected model's provider traits and updates the selected reasoning level. `ComposerPickerFooter` accepts `showPermissions` so permissions do not appear in two places.
- `apps/web/src/components/chat/ComposerFooterControls.tsx` renders the access popup as a vertical list. Every runtime mode row shows its icon, name, and description; the selected row is highlighted. This replaces the horizontal icon-only mode strip and the separate current-mode description below it.
- `apps/web/src/components/chat/CompactComposerControlsMenu.tsx` can show a hidden reasoning control in the compact overflow menu, alongside permissions when those controls do not fit.
- `apps/web/src/components/chat/composerControlsOwnership.ts` keeps the access block visible at the default mode and moves its permissions choice into overflow if the block does not fit. Keep this ownership logic in sync with the order of blocks in `ComposerControlsBar.tsx`.

### Reapplying after an upstream update

When updating from the original T3 Code repository, inspect these files for upstream changes before reapplying this customization. The implementation depends on the provider-trait helpers and `EffortLevels` in `ComposerModelEffort.tsx`, the `effortColumn`/trigger props on the model picker, the `composer.effort` and `composer.mode` shortcut routing, and the adaptive resting-control/overflow behavior. The native inspector feature also depends on the app-origin check and `context-menu` handler in `apps/desktop/src/window/DesktopWindow.ts`, Electron `WebFrameMain.executeJavaScript`, and the `ElectronShell.copyText` service. If upstream refactors any of these, re-create the behavior using the new component boundaries instead of copying an old file over the updated one.

The desired end state is:

1. The model picker trigger displays the model name only; its popup lists models without a docked reasoning column.
2. A separate reasoning button shows the selected level and opens the selected model's available levels.
3. A separate access button follows reasoning and opens the runtime permission choices, including when access matches the default. If it moves for lack of space, permissions remain reachable from the composer overflow menu, without duplicate shortcut targets.
4. The permissions popup lists each access mode vertically, with an icon, name, and description on every row; the selected row is highlighted.
5. The reasoning and access controls continue to move into the compact overflow menu at narrow composer widths.

## Right-click element inspector

The native desktop context menu now offers **Inspect UI element**, **Copy UI element details**, and **Copy CSS selector** when right-clicking the T3 Code app UI. Inspect enters pick mode: move over the UI to highlight elements with a blue overlay, then click one to open the panel. Escape cancels pick mode; after selecting, use **Inspect another**, ×, or Escape to continue or close. The panel lists the selected element's selector, classes, attributes, computed styles, opening HTML tag, and short text preview, with per-row copy buttons. It opens below the title bar so it does not cover the window controls. The selector prefers a unique ID or stable attributes (`data-testid`, `data-test`, `data-cy`, `aria-label`, `role`, or `name`) and falls back to a tag/`:nth-of-type()` path. The details report uses the Electron clipboard service. The menu is limited to frames on the T3 Code application origin; embedded browser pages keep their own context menu. The regular Cut, Copy, Paste, and Select All actions are unchanged.

For a future upstream reapply, find the `contents.on("context-menu", ...)` handler and append the inspector items only for the app's own origin. Copy actions query the clicked element in `params.frame` at `params.x`/`params.y`; inspect mode instead installs temporary hover/click listeners into that same frame and cleans them up on selection, cancel, or close. Do not run the inspector against embedded or third-party browser contents. Keep selector generation and output formatting bounded so copied text remains useful to paste into a code discussion.

## Sidebar thread search setting

The sidebar search includes chat message contents by default. In **Settings → General → Search chat history**, turn the setting off to limit sidebar results to thread and project names. This is a client preference; command-palette search (`Cmd/Ctrl+K`) continues to include message contents.

When **Boring sidebar (group by project)** is enabled, General settings also shows **Include project threads in search**. With this enabled, searching for a project name shows its project heading and all of its child threads together. This option is enabled by default and only applies to sidebar search.

## Sidebar thread card settings

In **Settings → General → Thread card details**, each sidebar thread card field can be shown or hidden independently. The controls cover project name, machine name, activity time, provider icon, pull request and issue badges, Git change counts, and terminal status. A live example card updates as the switches change. Hiding **Machine name** removes the local or remote system label below each thread title.

The card shows only the most recently used agent/provider icon, placed immediately before the activity time. This keeps the card compact when a thread has used multiple agents. The card field choices are client settings and do not change thread data.

## Move a thread to another project

The web and desktop thread menus include **Move to project…** in the sidebar and thread header. The searchable picker lists other projects in the thread's environment. This feature needs a compatible client and backend: the client dispatches `thread.change-project`, while the server persists the changed project and publishes `thread.project-changed`. The built-in `t3_thread_organize` MCP tool also supports the `change_project` action.

## Chat turn navigator

The chat timeline has a compact vertical rail beside the message column, with one clickable dot for each user turn. Selecting a dot scrolls that turn into view and aligns its user message near the top of the viewport. When dot hit areas overlap in long chats, pointer clicks select the dot nearest the click position. On-screen turns, the current turn, and the hovered turn use blue dots. Visibility is based on rendered chat rows intersecting the timeline viewport, so buffered offscreen turns should not be highlighted. The rail grows with the number of turns, with a 112 px minimum and a 320 px maximum, so long conversations do not create a full-height rail. The previous/next arrow controls are centered on the rail, and keyboard users can move between dots with the arrow keys, Home, and End.

After resolving upstream conflicts, run `vp run --filter @t3tools/web typecheck`, then build the Windows installer with the command and environment variable in the build-issues section above. These UI changes use shared web components, so they appear in both the desktop build and web client wherever those components are used.
