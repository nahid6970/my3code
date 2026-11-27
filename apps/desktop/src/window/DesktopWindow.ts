import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Schedule from "effect/Schedule";
import * as Semaphore from "effect/Semaphore";

import * as Electron from "electron";
import { msg } from "gt-i18n";

import {
  type DatabaseMigrationProgress,
  type DesktopSnapShotEvent,
  DEFAULT_CLIENT_SETTINGS,
} from "@t3tools/contracts";

import * as DesktopAssets from "../app/DesktopAssets.ts";
import * as DesktopClerk from "../app/DesktopClerk.ts";
import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";
import * as DesktopPrimaryPaste from "../app/DesktopPrimaryPaste.ts";
import { makeComponentLogger } from "../app/DesktopObservability.ts";
import * as DesktopState from "../app/DesktopState.ts";
import * as ElectronMenu from "../electron/ElectronMenu.ts";
import { getDesktopOrigin, getDesktopUrl } from "../electron/ElectronProtocol.ts";
import * as ElectronShell from "../electron/ElectronShell.ts";
import * as ElectronTheme from "../electron/ElectronTheme.ts";
import * as ElectronWindow from "../electron/ElectronWindow.ts";
import {
  MENU_ACTION_CHANNEL,
  QUIT_SHORTCUT_CHANNEL,
  SNAP_SHOT_EVENT_CHANNEL,
  TRACKPAD_SCROLL_BEGIN_CHANNEL,
  TRACKPAD_SCROLL_END_CHANNEL,
  WINDOW_FULLSCREEN_STATE_CHANNEL,
} from "../ipc/channels.ts";
import {
  PASSKEY_BRIDGE_ARGUMENT,
  PRIMARY_PASTE_DISABLED_ARGUMENT,
} from "../preview/GuestProtocol.ts";
import * as PreviewManager from "../preview/Manager.ts";
import * as PreviewPasskeys from "../preview/Passkeys.ts";
import * as DesktopAppSettings from "../settings/DesktopAppSettings.ts";
import * as DesktopClientSettings from "../settings/DesktopClientSettings.ts";
import * as ElectronApp from "../electron/ElectronApp.ts";
import { m } from "../i18n/messages.ts";
import * as DesktopRendererHistory from "../telemetry/DesktopRendererHistory.ts";
import { makeQuitShortcutHandler } from "./QuitHold.ts";
import { copyContextMenuImage } from "./ContextMenuImage.ts";
import { installMainWindowRemoteRequestHeaderPolicy } from "./RemoteRequestHeaders.ts";

const TITLEBAR_HEIGHT = 40;

class ContextMenuImageCopyError extends Schema.TaggedError<ContextMenuImageCopyError>()(
  "ContextMenuImageCopyError",
  { cause: Schema.Defect() },
) {
  override get message(): string {
    return "Could not copy the context-menu image.";
  }
}

class ContextMenuElementCopyError extends Schema.TaggedError<ContextMenuElementCopyError>()(
  "ContextMenuElementCopyError",
  { cause: Schema.Defect() },
) {
  override get message(): string {
    return "Could not inspect the context-menu element.";
  }
}

type ContextMenuElementDetails = {
  selector: string;
  tag: string;
  classes: string;
  attributes: ReadonlyArray<string>;
  text: string;
  openTag: string;
};

function isContextMenuElementDetails(value: unknown): value is ContextMenuElementDetails {
  if (typeof value !== "object" || value === null) return false;
  const details = value as Partial<ContextMenuElementDetails>;
  return (
    typeof details.selector === "string" &&
    typeof details.tag === "string" &&
    typeof details.classes === "string" &&
    Array.isArray(details.attributes) &&
    details.attributes.every((attribute) => typeof attribute === "string") &&
    typeof details.text === "string" &&
    typeof details.openTag === "string"
  );
}

function buildContextMenuElementScript(
  x: number,
  y: number,
  inspect = false,
): string {
  return `(() => {
    const x = ${JSON.stringify(x)};
    const y = ${JSON.stringify(y)};
    const element = document.elementFromPoint(x, y);
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return null;
    const target = element;
    const stableAttributes = ["data-testid", "data-test", "data-cy", "aria-label", "role", "name"];
    const unique = (selector) => {
      try { return document.querySelectorAll(selector).length === 1; }
      catch { return false; }
    };
    const selectorParts = [];
    let current = target;
    while (current && current.nodeType === Node.ELEMENT_NODE) {
      const tag = current.localName.toLowerCase();
      let part = tag;
      if (current.id) {
        const idSelector = "#" + CSS.escape(current.id);
        if (unique(idSelector)) part = idSelector;
      }
      if (part === tag) {
        for (const name of stableAttributes) {
          const value = current.getAttribute(name);
          if (!value) continue;
          const candidate = tag + "[" + name + "=" + JSON.stringify(value) + "]";
          if (unique(candidate)) { part = candidate; break; }
        }
      }
      if (part === tag && current.parentElement) {
        const siblings = Array.from(current.parentElement.children).filter((sibling) => sibling.localName === current.localName);
        if (siblings.length > 1) part += ":nth-of-type(" + (siblings.indexOf(current) + 1) + ")";
      }
      selectorParts.unshift(part);
      const selector = selectorParts.join(" > ");
      if (unique(selector)) break;
      if (current === document.body) break;
      current = current.parentElement;
    }
    const selector = selectorParts.join(" > ");
    const classes = target.getAttribute("class") || "";
    const attributes = ["id", "data-testid", "data-test", "data-cy", "role", "aria-label", "aria-labelledby", "type", "name", "title"]
      .map((name) => [name, target.getAttribute(name)])
      .filter(([, value]) => value !== null)
      .map(([name, value]) => name + "=" + JSON.stringify(value));
    const text = (target.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 180);
    const details = {
      selector,
      tag: target.localName.toLowerCase(),
      classes,
      attributes,
      text,
      openTag: target.cloneNode(false).outerHTML
    };
    if (!${JSON.stringify(inspect)}) return details;

    window.__t3CodeElementInspector?.close?.();
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;pointer-events:none;z-index:2147483646;background:rgba(59,130,246,.22);border:2px solid #3b82f6;box-sizing:border-box";
    document.body.appendChild(overlay);
    const updateOverlay = () => {
      const rect = target.getBoundingClientRect();
      Object.assign(overlay.style, { display: "block", top: rect.top + "px", left: rect.left + "px", width: rect.width + "px", height: rect.height + "px" });
    };
    updateOverlay();

    const panel = document.createElement("section");
    panel.id = "__t3code_element_inspector";
    panel.style.cssText = "position:fixed;top:20px;right:20px;width:380px;max-width:calc(100vw - 32px);max-height:80vh;overflow:auto;background:#1e1e2e;color:#cdd6f4;font:12px/1.45 'JetBrains Mono',Consolas,monospace;border:1px solid #3b82f6;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,.6);z-index:2147483647;user-select:text";
    const header = document.createElement("header");
    header.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#181825;border-bottom:1px solid #313244;font-weight:700;font-size:13px";
    const title = document.createElement("span");
    title.textContent = "🔍 T3 UI Inspector";
    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "×";
    closeButton.title = "Close inspector";
    closeButton.style.cssText = "background:none;border:0;color:#f38ba8;cursor:pointer;font-size:18px;padding:0 4px";
    header.append(title, closeButton);
    const tagLine = document.createElement("div");
    tagLine.textContent = "<" + details.tag + ">";
    tagLine.style.cssText = "padding:6px 12px;color:#89b4fa;font-size:13px;border-bottom:1px solid #313244;background:#181825";
    const rows = document.createElement("div");
    rows.style.padding = "6px 0";
    const computed = getComputedStyle(target);
    const computedStyles = ["display","position","width","height","margin","padding","background","color","font-size","font-family","border","flex","z-index","opacity","overflow"].map((name) => name + ": " + computed.getPropertyValue(name)).join(";\\n") + ";";
    const rowValues = [
      ["CSS Selector", details.selector],
      ["Tag", details.tag],
      ["Classes", details.classes || "(none)"],
      ["ID", target.id || "(none)"],
      ["Attributes", details.attributes.join("\\n") || "(none)"],
      ["Computed Style", computedStyles],
      ["HTML (open tag)", details.openTag],
      ["Text Content", details.text || "(none)"],
    ];
    for (const [label, value] of rowValues) {
      const row = document.createElement("div");
      row.style.cssText = "padding:6px 12px;border-bottom:1px solid #313244;display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-rows:auto auto;gap:2px 8px";
      const labelNode = document.createElement("div");
      labelNode.textContent = label;
      labelNode.style.cssText = "grid-column:1;grid-row:1;color:#a6e3a1;font-size:10px;text-transform:uppercase;letter-spacing:.05em;opacity:.8";
      const valueNode = document.createElement("pre");
      valueNode.textContent = value;
      valueNode.style.cssText = "grid-column:1;grid-row:2;margin:0;white-space:pre-wrap;word-break:break-word;color:#cdd6f4;font:11px/1.4 'JetBrains Mono',Consolas,monospace;max-height:80px;overflow:auto";
      const copyButton = document.createElement("button");
      copyButton.type = "button";
      copyButton.textContent = "Copy";
      copyButton.style.cssText = "grid-column:2;grid-row:1/3;align-self:center;background:#313244;border:1px solid #45475a;color:#cdd6f4;border-radius:4px;padding:3px 8px;cursor:pointer;font:11px 'JetBrains Mono',Consolas,monospace";
      copyButton.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(value);
          copyButton.textContent = "✓";
          setTimeout(() => { copyButton.textContent = "Copy"; }, 1200);
        } catch {}
      });
      row.append(labelNode, valueNode, copyButton);
      rows.appendChild(row);
    }
    panel.append(header, tagLine, rows);
    document.body.appendChild(panel);
    const close = () => {
      overlay.remove();
      panel.remove();
      document.removeEventListener("scroll", updateOverlay, true);
      window.removeEventListener("resize", updateOverlay);
      document.removeEventListener("keydown", onKeyDown, true);
      if (window.__t3CodeElementInspector?.close === close) delete window.__t3CodeElementInspector;
    };
    const onKeyDown = (event) => { if (event.key === "Escape") close(); };
    closeButton.addEventListener("click", close);
    document.addEventListener("scroll", updateOverlay, true);
    window.addEventListener("resize", updateOverlay);
    document.addEventListener("keydown", onKeyDown, true);
    window.__t3CodeElementInspector = { close };
    return details;
  })()`;
}

function buildContextMenuInspectorModeScript(): string {
  return `(() => {
    window.__t3CodeElementInspector?.close?.();
    let picking = false;
    let overlay = null;
    let hint = null;
    let panel = null;
    let cursorStyle = null;

    const unique = (selector) => {
      try { return document.querySelectorAll(selector).length === 1; }
      catch { return false; }
    };
    const getSelector = (target) => {
      const parts = [];
      let current = target;
      const stableAttributes = ["data-testid", "data-test", "data-cy", "aria-label", "role", "name"];
      while (current && current.nodeType === Node.ELEMENT_NODE) {
        const tag = current.localName.toLowerCase();
        let part = tag;
        if (current.id) {
          const idSelector = "#" + CSS.escape(current.id);
          if (unique(idSelector)) part = idSelector;
        }
        if (part === tag) {
          for (const name of stableAttributes) {
            const value = current.getAttribute(name);
            if (!value) continue;
            const candidate = tag + "[" + name + "=" + JSON.stringify(value) + "]";
            if (unique(candidate)) { part = candidate; break; }
          }
        }
        if (part === tag && current.parentElement) {
          const siblings = Array.from(current.parentElement.children).filter((sibling) => sibling.localName === current.localName);
          if (siblings.length > 1) part += ":nth-of-type(" + (siblings.indexOf(current) + 1) + ")";
        }
        parts.unshift(part);
        if (unique(parts.join(" > ")) || current === document.body) break;
        current = current.parentElement;
      }
      return parts.join(" > ");
    };
    const collect = (target) => {
      const computed = getComputedStyle(target);
      const computedStyles = ["display","position","width","height","margin","padding","background","color","font-size","font-family","border","flex","z-index","opacity","overflow"]
        .map((name) => name + ": " + computed.getPropertyValue(name)).join(";\\n") + ";";
      const attributes = ["id", "data-testid", "data-test", "data-cy", "role", "aria-label", "aria-labelledby", "type", "name", "title"]
        .map((name) => [name, target.getAttribute(name)])
        .filter(([, value]) => value !== null)
        .map(([name, value]) => name + "=" + JSON.stringify(value));
      return [
        ["CSS Selector", getSelector(target)],
        ["Tag", target.localName.toLowerCase()],
        ["Classes", target.getAttribute("class") || "(none)"],
        ["ID", target.id || "(none)"],
        ["Attributes", attributes.join(" \\n") || "(none)"],
        ["Inline Style", target.style?.cssText || "(none)"],
        ["Computed Style", computedStyles],
        ["HTML (open tag)", target.cloneNode(false).outerHTML],
        ["Text Content", (target.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 180) || "(none)"],
      ];
    };
    const ensureOverlay = () => {
      if (overlay) return;
      overlay = document.createElement("div");
      overlay.style.cssText = "position:fixed;pointer-events:none;z-index:2147483646;background:rgba(59,130,246,.22);border:2px solid #3b82f6;box-sizing:border-box";
      document.body.appendChild(overlay);
    };
    const highlight = (target) => {
      if (!(target instanceof Element) || target === overlay || panel?.contains(target) || hint?.contains(target)) return;
      ensureOverlay();
      const rect = target.getBoundingClientRect();
      Object.assign(overlay.style, { display: "block", top: rect.top + "px", left: rect.left + "px", width: rect.width + "px", height: rect.height + "px" });
    };
    const removePickingListeners = () => {
      picking = false;
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("click", onPick, true);
      cursorStyle?.remove();
      cursorStyle = null;
      hint?.remove();
      hint = null;
    };
    const close = () => {
      removePickingListeners();
      overlay?.remove();
      overlay = null;
      panel?.remove();
      panel = null;
      document.removeEventListener("keydown", onKeyDown, true);
      if (window.__t3CodeElementInspector?.close === close) delete window.__t3CodeElementInspector;
    };
    const showPanel = (target) => {
      panel?.remove();
      panel = document.createElement("section");
      panel.id = "__t3code_element_inspector";
      panel.style.cssText = "position:fixed;top:52px;right:12px;width:380px;max-width:calc(100vw - 24px);max-height:calc(100vh - 64px);overflow:auto;background:#1e1e2e;color:#cdd6f4;font:12px/1.45 'JetBrains Mono',Consolas,monospace;border:1px solid #3b82f6;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,.6);z-index:2147483647;user-select:text";
      const header = document.createElement("header");
      header.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#181825;border-bottom:1px solid #313244;font-weight:700;font-size:13px";
      const title = document.createElement("span");
      title.textContent = "🔍 T3 UI Inspector";
      const actions = document.createElement("div");
      actions.style.cssText = "display:flex;align-items:center;gap:8px";
      const reselect = document.createElement("button");
      reselect.type = "button";
      reselect.textContent = "Inspect another";
      reselect.style.cssText = "background:#313244;border:1px solid #45475a;color:#cdd6f4;border-radius:4px;padding:3px 8px;cursor:pointer;font:11px 'JetBrains Mono',Consolas,monospace";
      reselect.addEventListener("click", () => { panel?.remove(); panel = null; enterPicking(); });
      const closeButton = document.createElement("button");
      closeButton.type = "button";
      closeButton.textContent = "×";
      closeButton.title = "Close inspector";
      closeButton.style.cssText = "background:none;border:0;color:#f38ba8;cursor:pointer;font-size:18px;padding:0 4px";
      closeButton.addEventListener("click", close);
      actions.append(reselect, closeButton);
      header.append(title, actions);
      const tagLine = document.createElement("div");
      tagLine.textContent = "<" + target.localName.toLowerCase() + ">";
      tagLine.style.cssText = "padding:6px 12px;color:#89b4fa;font-size:13px;border-bottom:1px solid #313244;background:#181825";
      const rows = document.createElement("div");
      rows.style.padding = "6px 0";
      for (const [label, value] of collect(target)) {
        const row = document.createElement("div");
        row.style.cssText = "padding:6px 12px;border-bottom:1px solid #313244;display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-rows:auto auto;gap:2px 8px";
        const labelNode = document.createElement("div");
        labelNode.textContent = label;
        labelNode.style.cssText = "grid-column:1;grid-row:1;color:#a6e3a1;font-size:10px;text-transform:uppercase;letter-spacing:.05em;opacity:.8";
        const valueNode = document.createElement("pre");
        valueNode.textContent = value;
        valueNode.style.cssText = "grid-column:1;grid-row:2;margin:0;white-space:pre-wrap;word-break:break-word;color:#cdd6f4;font:11px/1.4 'JetBrains Mono',Consolas,monospace;max-height:80px;overflow:auto";
        const copyButton = document.createElement("button");
        copyButton.type = "button";
        copyButton.textContent = "Copy";
        copyButton.style.cssText = "grid-column:2;grid-row:1/3;align-self:center;background:#313244;border:1px solid #45475a;color:#cdd6f4;border-radius:4px;padding:3px 8px;cursor:pointer;font:11px 'JetBrains Mono',Consolas,monospace";
        copyButton.addEventListener("click", async () => {
          try { await navigator.clipboard.writeText(value); copyButton.textContent = "✓"; setTimeout(() => { copyButton.textContent = "Copy"; }, 1200); }
          catch {}
        });
        row.append(labelNode, valueNode, copyButton);
        rows.appendChild(row);
      }
      panel.append(header, tagLine, rows);
      document.body.appendChild(panel);
    };
    const onMove = (event) => highlight(event.target);
    const onPick = (event) => {
      const target = event.target instanceof Element ? event.target : event.target?.parentElement;
      if (!picking || !target || panel?.contains(target) || hint?.contains(target)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      removePickingListeners();
      highlight(target);
      showPanel(target);
    };
    const onKeyDown = (event) => { if (event.key === "Escape") close(); };
    function enterPicking() {
      picking = true;
      ensureOverlay();
      cursorStyle = document.createElement("style");
      cursorStyle.textContent = "*{cursor:crosshair!important}";
      document.head.appendChild(cursorStyle);
      hint = document.createElement("div");
      hint.textContent = "Move over an element and click to inspect · Esc to cancel";
      hint.style.cssText = "position:fixed;top:52px;left:50%;transform:translateX(-50%);padding:7px 12px;background:#181825;color:#cdd6f4;border:1px solid #3b82f6;border-radius:6px;font:12px 'JetBrains Mono',Consolas,monospace;z-index:2147483647;pointer-events:none;box-shadow:0 4px 16px rgba(0,0,0,.4)";
      document.body.appendChild(hint);
      document.addEventListener("mousemove", onMove, true);
      document.addEventListener("click", onPick, true);
    }
    document.addEventListener("keydown", onKeyDown, true);
    window.__t3CodeElementInspector = { close };
    enterPicking();
    return true;
  })()`;
}

function formatContextMenuElementDetails(details: ContextMenuElementDetails): string {
  return [
    "T3 Code UI element",
    `CSS selector: ${details.selector}`,
    `Tag: <${details.tag}>`,
    `Classes: ${details.classes || "(none)"}`,
    ...(details.attributes.length > 0 ? [`Attributes: ${details.attributes.join(" ")}`] : []),
    ...(details.text ? [`Text: ${details.text}`] : []),
    `HTML: ${details.openTag}`,
  ].join("\n");
}

function copyContextMenuElement(
  frame: Electron.WebFrameMain,
  x: number,
  y: number,
  mode: "details" | "selector",
  copyText: (text: string) => Effect.Effect<void>,
): Effect.Effect<void> {
  return Effect.tryPromise({
    try: async () => {
      if (frame.isDestroyed()) return null;
      return await frame.executeJavaScript(buildContextMenuElementScript(x, y));
    },
    catch: (cause) => new ContextMenuElementCopyError({ cause }),
  }).pipe(
    Effect.flatMap((value) => {
      if (!isContextMenuElementDetails(value)) return Effect.void;
      return copyText(
        mode === "selector" ? value.selector : formatContextMenuElementDetails(value),
      );
    }),
    Effect.catch(() => logWindowWarning("failed to copy context-menu element details")),
  );
}

function inspectContextMenuElement(frame: Electron.WebFrameMain): Effect.Effect<void> {
  return Effect.tryPromise({
    try: async () => {
      if (frame.isDestroyed()) return null;
      return await frame.executeJavaScript(buildContextMenuInspectorModeScript());
    },
    catch: (cause) => new ContextMenuElementCopyError({ cause }),
  }).pipe(
    Effect.catch(() => logWindowWarning("failed to inspect context-menu element")),
  );
}
// Match --workspace-topbar-height in apps/web/src/index.css; native macOS buttons stay 14 points at any zoom.
const MACOS_WORKSPACE_TOPBAR_HEIGHT = 52;
const MACOS_WINDOW_BUTTON_RADIUS = 7;

function parseMailtoAddress(rawUrl: string): Option.Option<string> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return Option.none();
  }
  if (url.protocol !== "mailto:" || url.pathname === "") return Option.none();
  try {
    return Option.some(decodeURIComponent(url.pathname));
  } catch {
    return Option.some(url.pathname);
  }
}

function syncMacosWindowButtons(window: Electron.BrowserWindow): void {
  if (window.isDestroyed() || window.isFullScreen()) return;
  window.setWindowButtonPosition({
    x: 16,
    y: Math.round(
      (MACOS_WORKSPACE_TOPBAR_HEIGHT * window.webContents.getZoomFactor()) / 2 -
        MACOS_WINDOW_BUTTON_RADIUS,
    ),
  });
}

const TITLEBAR_COLOR = "#01000000"; // #00000000 does not work correctly on Linux
const TITLEBAR_LIGHT_SYMBOL_COLOR = "#1f2937";
const TITLEBAR_DARK_SYMBOL_COLOR = "#f8fafc";
const MAIN_WINDOW_BOUNDS_PERSIST_DEBOUNCE_MS = 500;
const DEVELOPMENT_LOAD_RETRY_DELAYS_MS = [100, 250, 500, 1_000, 2_000] as const;
const RENDERER_RECOVERY_RELOAD_DELAY_MS = 500;
const RENDERER_RECOVERY_MAX_ATTEMPTS = 3;
const RENDERER_RECOVERY_WINDOW_MS = 60_000;
const DEVELOPMENT_RETRYABLE_LOAD_ERROR_CODES = new Set([-2, -7, -9, -102, -105, -106, -118]);

type WindowTitleBarOptions = Pick<
  Electron.BrowserWindowConstructorOptions,
  "titleBarOverlay" | "titleBarStyle" | "trafficLightPosition"
>;

type DesktopWindowRuntimeServices =
  | DesktopEnvironment.DesktopEnvironment
  | DesktopState.DesktopState
  | DesktopAssets.DesktopAssets
  | DesktopAppSettings.DesktopAppSettings
  | DesktopClientSettings.DesktopClientSettings
  | ElectronApp.ElectronApp
  | ElectronMenu.ElectronMenu
  | ElectronShell.ElectronShell
  | ElectronTheme.ElectronTheme
  | ElectronWindow.ElectronWindow
  | DesktopRendererHistory.DesktopRendererHistory
  | PreviewManager.PreviewManager;

export type DesktopWindowError =
  | ElectronWindow.ElectronWindowCreateError
  | PreviewManager.PreviewManagerError;

export type MainWindowZoomDirection = "in" | "out" | "reset";
export type MainWindowContentsCommand = "reload" | "forceReload" | "toggleDevTools";

export class DesktopWindow extends Context.Service<
  DesktopWindow,
  {
    readonly createMain: Effect.Effect<Electron.BrowserWindow, DesktopWindowError>;
    readonly ensureMain: Effect.Effect<Electron.BrowserWindow, DesktopWindowError>;
    readonly revealOrCreateMain: Effect.Effect<Electron.BrowserWindow, DesktopWindowError>;
    readonly activate: Effect.Effect<void, DesktopWindowError>;
    readonly createMainIfBackendReady: Effect.Effect<void, DesktopWindowError>;
    readonly showConnectingSplash: Effect.Effect<void>;
    readonly handleBackendReady: (httpBaseUrl: URL) => Effect.Effect<void, DesktopWindowError>;
    readonly handleBackendNotReady: Effect.Effect<void>;
    readonly flushMainWindowBounds: Effect.Effect<void>;
    readonly prepareCaptureReveal: Effect.Effect<void>;
    readonly dispatchMenuAction: (
      action: string,
      options?: { readonly reveal?: boolean },
    ) => Effect.Effect<void, DesktopWindowError>;
    readonly dispatchSnapShotEvent: (
      event: DesktopSnapShotEvent,
    ) => Effect.Effect<void, DesktopWindowError>;
    // Electron zoom roles target focused guests; zoomMain must always target the app.
    readonly zoomMain: (direction: MainWindowZoomDirection) => Effect.Effect<void>;
    readonly runMainContentsCommand: (command: MainWindowContentsCommand) => Effect.Effect<void>;
    readonly syncAppearance: Effect.Effect<void>;
  }
>()("@t3tools/desktop/window/DesktopWindow") {}

const { logInfo: logWindowInfo, logWarning: logWindowWarning } =
  makeComponentLogger("desktop-window");

function getIconOption(
  iconPaths: DesktopAssets.DesktopIconPaths,
  platform: NodeJS.Platform,
): { icon: string } | Record<string, never> {
  if (platform === "darwin") return {};
  const ext = platform === "win32" ? "ico" : "png";
  return Option.match(iconPaths[ext], {
    onNone: () => ({}),
    onSome: (icon) => ({ icon }),
  });
}

function getInitialWindowBackgroundColor(shouldUseDarkColors: boolean): string {
  return shouldUseDarkColors ? "#000000" : "#ffffff";
}

type DisplayBounds = Pick<Electron.Rectangle, "x" | "y" | "width" | "height">;

// A window snapped to a display edge can be reported 1px past that edge.
const SAVED_BOUNDS_EDGE_TOLERANCE_PX = 1;

function windowFitsWithinDisplay(
  windowBounds: DesktopAppSettings.DesktopWindowBounds,
  displayBounds: DisplayBounds,
): boolean {
  const tolerance = SAVED_BOUNDS_EDGE_TOLERANCE_PX;
  return (
    windowBounds.x >= displayBounds.x - tolerance &&
    windowBounds.y >= displayBounds.y - tolerance &&
    windowBounds.x + windowBounds.width <= displayBounds.x + displayBounds.width + tolerance &&
    windowBounds.y + windowBounds.height <= displayBounds.y + displayBounds.height + tolerance
  );
}

function overlapArea(left: DisplayBounds, right: DisplayBounds): number {
  const width = Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x);
  const height = Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y);
  return width > 0 && height > 0 ? width * height : 0;
}

function displayMatching(
  bounds: DisplayBounds,
  displays: readonly DisplayBounds[],
): DisplayBounds | undefined {
  let match: DisplayBounds | undefined;
  let matchArea = 0;
  for (const display of displays) {
    const area = overlapArea(bounds, display);
    if (area > matchArea) {
      match = display;
      matchArea = area;
    }
  }
  return match;
}

// Normal bounds of a maximized window can sit on, or straddle into, another display than the window.
function normalBoundsOnWindowDisplay(
  normalBounds: DisplayBounds,
  windowBounds: DisplayBounds,
  displays: readonly DisplayBounds[],
): DisplayBounds {
  const target = displayMatching(windowBounds, displays);
  if (target === undefined || windowFitsWithinDisplay(normalBounds, target)) {
    return normalBounds;
  }
  const source = displayMatching(normalBounds, displays) ?? target;
  const width = Math.min(normalBounds.width, target.width);
  const height = Math.min(normalBounds.height, target.height);
  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
  return {
    x: clamp(target.x + normalBounds.x - source.x, target.x, target.x + target.width - width),
    y: clamp(target.y + normalBounds.y - source.y, target.y, target.y + target.height - height),
    width,
    height,
  };
}

function readDisplayBoundsOrEmpty(): readonly DisplayBounds[] {
  try {
    return Electron.screen.getAllDisplays().map((display) => display.bounds);
  } catch {
    return [];
  }
}

function windowBoundsEqual(
  left: DesktopAppSettings.DesktopWindowBounds,
  right: DesktopAppSettings.DesktopWindowBounds,
): boolean {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
}

export function resolveInitialMainWindowBounds(
  persistedBounds: DesktopAppSettings.DesktopWindowBounds | null,
  displays: readonly DisplayBounds[],
): DesktopAppSettings.DesktopWindowBounds | typeof DesktopAppSettings.DEFAULT_MAIN_WINDOW_SIZE {
  if (
    persistedBounds !== null &&
    displays.some((display) => windowFitsWithinDisplay(persistedBounds, display))
  ) {
    return persistedBounds;
  }
  return DesktopAppSettings.DEFAULT_MAIN_WINDOW_SIZE;
}

function buildConnectingSplashDataUrl(
  shouldUseDarkColors: boolean,
  progress: DatabaseMigrationProgress | null,
): string {
  const background = getInitialWindowBackgroundColor(shouldUseDarkColors);
  const label = shouldUseDarkColors ? "#9ca3af" : "#6b7280";
  const accent = shouldUseDarkColors ? "#f8fafc" : "#1f2937";
  const track = shouldUseDarkColors ? "rgba(248,250,252,0.18)" : "rgba(31,41,55,0.18)";
  const message = progress
    ? `Upgrading database (${progress.current} of ${progress.total})`
    : "Connecting to WSL…";
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>html,body{margin:0;height:100%}body{background:${background};color:${label};font-family:system-ui,-apple-system,'Segoe UI',sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;-webkit-user-select:none;user-select:none;-webkit-app-region:drag}.spinner{width:26px;height:26px;border:3px solid ${track};border-top-color:${accent};border-radius:50%;animation:spin .8s linear infinite}.label{font-size:13px}@keyframes spin{to{transform:rotate(360deg)}}</style></head><body><div class="spinner"></div><div class="label">${message}</div></body></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

export function isSameOriginRendererNavigation(input: {
  readonly applicationUrl: string;
  readonly navigationUrl: string;
}): boolean {
  try {
    const applicationUrl = new URL(input.applicationUrl);
    const navigationUrl = new URL(input.navigationUrl);
    // Node serializes custom-scheme origins as "null", even for different hosts and schemes.
    return (
      applicationUrl.host !== "" &&
      navigationUrl.protocol === applicationUrl.protocol &&
      navigationUrl.host === applicationUrl.host
    );
  } catch {
    return false;
  }
}

function isRetryableDevelopmentRendererLoadFailure(input: {
  readonly applicationUrl: string;
  readonly errorCode: number;
  readonly isMainFrame: boolean;
  readonly validatedUrl: string;
}): boolean {
  return (
    input.isMainFrame &&
    DEVELOPMENT_RETRYABLE_LOAD_ERROR_CODES.has(input.errorCode) &&
    isSameOriginRendererNavigation({
      applicationUrl: input.applicationUrl,
      navigationUrl: input.validatedUrl,
    })
  );
}

function concealPendingQuitWindow(
  window: Pick<
    Electron.BrowserWindow,
    "isDestroyed" | "isFullScreen" | "setFullScreen" | "setOpacity"
  >,
): void {
  if (window.isDestroyed()) return;
  if (window.isFullScreen()) {
    window.setFullScreen(false);
  }
  // Linux lacks Electron window opacity; release-gated quits remain visible there.
  window.setOpacity(0);
}

function getWindowTitleBarOptions(
  shouldUseDarkColors: boolean,
  platform: NodeJS.Platform,
): WindowTitleBarOptions {
  if (platform === "darwin") {
    return {
      titleBarStyle: "hiddenInset",
      trafficLightPosition: {
        x: 16,
        y: MACOS_WORKSPACE_TOPBAR_HEIGHT / 2 - MACOS_WINDOW_BUTTON_RADIUS,
      },
    };
  }

  return {
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: TITLEBAR_COLOR,
      height: TITLEBAR_HEIGHT,
      symbolColor: shouldUseDarkColors ? TITLEBAR_DARK_SYMBOL_COLOR : TITLEBAR_LIGHT_SYMBOL_COLOR,
    },
  };
}

function syncWindowAppearance(
  window: Electron.BrowserWindow,
  hasTitleBarOverlay: boolean,
  shouldUseDarkColors: boolean,
  platform: NodeJS.Platform,
): Effect.Effect<void> {
  return Effect.sync(() => {
    if (window.isDestroyed()) {
      return;
    }

    window.setBackgroundColor(getInitialWindowBackgroundColor(shouldUseDarkColors));
    const { titleBarOverlay } = getWindowTitleBarOptions(shouldUseDarkColors, platform);
    if (hasTitleBarOverlay && typeof titleBarOverlay === "object") {
      window.setTitleBarOverlay(titleBarOverlay);
    }
  });
}

type RevealSubscription = (listener: () => void) => void;

function bindFirstRevealTrigger(
  subscribers: readonly RevealSubscription[],
  reveal: () => void,
): void {
  let revealed = false;
  const fire = () => {
    if (revealed) return;
    revealed = true;
    reveal();
  };
  for (const subscribe of subscribers) {
    subscribe(fire);
  }
}

/** @public */
export const make = Effect.gen(function* () {
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  const desktopState = yield* DesktopState.DesktopState;
  const assets = yield* DesktopAssets.DesktopAssets;
  const electronMenu = yield* ElectronMenu.ElectronMenu;
  const electronShell = yield* ElectronShell.ElectronShell;
  const electronTheme = yield* ElectronTheme.ElectronTheme;
  const electronWindow = yield* ElectronWindow.ElectronWindow;
  const previewManager = yield* PreviewManager.PreviewManager;
  const previewPasskeys = yield* PreviewPasskeys.PreviewPasskeys;
  const primaryPaste = yield* DesktopPrimaryPaste.DesktopPrimaryPaste;
  const desktopSettings = yield* DesktopAppSettings.DesktopAppSettings;
  const clientSettings = yield* DesktopClientSettings.DesktopClientSettings;
  const electronApp = yield* ElectronApp.ElectronApp;
  const rendererHistory = yield* DesktopRendererHistory.DesktopRendererHistory;
  const backendReadyRef = yield* Ref.make(false);
  let backendHasStarted = false;
  let mainClosedDuringStartup = false;
  const splashWindowRef = yield* Ref.make<Option.Option<Electron.BrowserWindow>>(Option.none());
  const context = yield* Effect.context<DesktopWindowRuntimeServices>();
  const runFork = Effect.runForkWith(context);
  const runPromise = Effect.runPromiseWith(context);
  const mainWindowMutex = yield* Semaphore.make(1);
  const pendingMainReveals = new WeakMap<Electron.BrowserWindow, Effect.Effect<void>>();
  const revealMain = Effect.fn("desktop.window.revealMain")((window: Electron.BrowserWindow) =>
    Effect.suspend(() => pendingMainReveals.get(window) ?? electronWindow.reveal(window)),
  );
  let flushMainWindowBounds: Effect.Effect<void> = Effect.void;
  let remoteRequestHeaderOwner: Electron.BrowserWindow | null = null;

  const dismissConnectingSplash = Effect.gen(function* () {
    const splash = yield* Ref.getAndSet(splashWindowRef, Option.none());
    if (Option.isSome(splash) && !splash.value.isDestroyed()) {
      splash.value.close();
    }
  });

  // Electron's first-window fallback can select the unregistered connecting splash; exclude it so main creation retries.
  const withoutSplash = (window: Option.Option<Electron.BrowserWindow>) =>
    Ref.get(splashWindowRef).pipe(
      Effect.map((splash) =>
        Option.isSome(splash) && Option.isSome(window) && window.value === splash.value
          ? Option.none<Electron.BrowserWindow>()
          : window,
      ),
    );

  const currentMainWindow = electronWindow.currentMainOrFirst.pipe(Effect.flatMap(withoutSplash));

  const zoomWindow = Effect.fn("desktop.window.zoomWindow")(function* (
    window: Electron.BrowserWindow,
    direction: MainWindowZoomDirection,
  ) {
    const webContents = window.webContents;
    webContents.setZoomLevel(
      direction === "reset" ? 0 : webContents.getZoomLevel() + (direction === "in" ? 0.5 : -0.5),
    );
    if (environment.platform === "darwin") syncMacosWindowButtons(window);
    // App zoom propagates to guests; restore each preview's own zoom.
    yield* previewManager.reapplyZoom();
  });

  const createWindow = Effect.fn("desktop.window.createWindow")(function* (): Effect.fn.Return<
    Option.Option<Electron.BrowserWindow>,
    DesktopWindowError
  > {
    if (yield* Ref.get(desktopState.quitting)) return Option.none();
    yield* previewManager.getBrowserSession();
    const applicationUrl = getDesktopUrl(environment.isDevelopment);
    const iconPaths = yield* assets.iconPaths;
    const iconOption = getIconOption(iconPaths, environment.platform);
    const shouldUseDarkColors = yield* electronTheme.shouldUseDarkColors;
    const persistedSettings = yield* desktopSettings.get;
    const persistedBounds = persistedSettings.mainWindowBounds;
    const displayBoundsResult = yield* Effect.sync(() => {
      try {
        return {
          _tag: "Success" as const,
          bounds: Electron.screen.getAllDisplays().map((display) => display.bounds),
        };
      } catch (cause) {
        return { _tag: "Failure" as const, cause };
      }
    });
    const displayBounds =
      displayBoundsResult._tag === "Success"
        ? displayBoundsResult.bounds
        : yield* logWindowWarning("failed to read connected displays; using defaults", {
            cause: displayBoundsResult.cause,
          }).pipe(Effect.as<readonly Electron.Rectangle[]>([]));
    const initialBounds = resolveInitialMainWindowBounds(persistedBounds, displayBounds);
    const restoredPersistedBounds = persistedBounds !== null && initialBounds === persistedBounds;
    if (persistedBounds !== null && initialBounds === DesktopAppSettings.DEFAULT_MAIN_WINDOW_SIZE) {
      yield* logWindowWarning("saved main window bounds could not be restored; using defaults");
    }
    if (yield* Ref.get(desktopState.quitting)) return Option.none();
    const window = yield* electronWindow.create({
      ...initialBounds,
      minWidth: DesktopAppSettings.MIN_MAIN_WINDOW_SIZE.width,
      minHeight: DesktopAppSettings.MIN_MAIN_WINDOW_SIZE.height,
      show: false,
      autoHideMenuBar: true,
      ...(environment.platform === "darwin" ? { disableAutoHideCursor: true } : {}),
      backgroundColor: getInitialWindowBackgroundColor(shouldUseDarkColors),
      ...iconOption,
      title: environment.displayName,
      ...getWindowTitleBarOptions(shouldUseDarkColors, environment.platform),
      webPreferences: {
        preload: environment.preloadPath,
        // Hidden-renderer throttling stalls first paint; re-enable it after the first reveal.
        backgroundThrottling: false,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webviewTag: true,
        // Guest fullscreen propagates to the embedder; both must opt out to keep it inside the webview.
        // The app's own fullscreen elements reach OS fullscreen through syncHtmlFullscreen.
        disableHtmlFullscreenWindowResize: true,
      },
    });
    if (yield* Ref.get(desktopState.quitting)) {
      yield* electronWindow.destroyAll;
      return Option.none();
    }

    pendingMainReveals.set(window, Effect.void);
    yield* rendererHistory.register(window.webContents, { surface: "main" });
    if (environment.platform === "darwin") {
      window.setAutoHideCursor(false);
    }
    let boundsPersistFiber: Fiber.Fiber<void, never> | undefined;
    let pendingBoundsPersistFiber: Fiber.Fiber<void, never> | undefined;
    let boundsPersistenceEnabled = persistedBounds === null || restoredPersistedBounds;
    let lastPersistableState: {
      readonly bounds: DesktopAppSettings.DesktopWindowBounds;
      readonly isMaximized: boolean;
    } | null = null;
    const readPersistableState = () => {
      if (window.isDestroyed()) {
        return null;
      }
      // Minimized windows report stale state on some platforms (macOS: not maximized, the
      // pre-move normal frame; Windows: -32000), so they keep the state seen before minimizing.
      if (window.isMinimized()) {
        return lastPersistableState;
      }
      const isMaximized = window.isMaximized();
      const bounds =
        window.isFullScreen() || isMaximized
          ? normalBoundsOnWindowDisplay(
              window.getNormalBounds(),
              window.getBounds(),
              readDisplayBoundsOrEmpty(),
            )
          : window.getBounds();
      const persistableBounds = DesktopAppSettings.normalizeMainWindowBounds({
        x: Math.round(bounds.x),
        y: Math.round(bounds.y),
        width: Math.round(bounds.width),
        height: Math.round(bounds.height),
      });
      lastPersistableState =
        persistableBounds === null ? null : { bounds: persistableBounds, isMaximized };
      return lastPersistableState;
    };
    const fallbackWindowBounds = boundsPersistenceEnabled
      ? null
      : (readPersistableState()?.bounds ?? null);
    const fallbackWindowMaximized = persistedSettings.mainWindowMaximized;
    const persistCurrentBounds = (): Fiber.Fiber<void, never> | undefined => {
      if (!boundsPersistenceEnabled) {
        return pendingBoundsPersistFiber;
      }
      const state = readPersistableState();
      if (state === null) {
        return pendingBoundsPersistFiber;
      }
      pendingBoundsPersistFiber = runFork(
        desktopSettings.setMainWindowBounds(state.bounds, state.isMaximized).pipe(
          Effect.asVoid,
          Effect.catch((error) =>
            logWindowWarning("failed to persist main window bounds", {
              message: error.message,
            }),
          ),
        ),
      );
      return pendingBoundsPersistFiber;
    };
    const scheduleBoundsPersist = () => {
      const state = readPersistableState();
      if (
        !boundsPersistenceEnabled &&
        (state === null ||
          (fallbackWindowBounds !== null &&
            windowBoundsEqual(state.bounds, fallbackWindowBounds) &&
            state.isMaximized === fallbackWindowMaximized))
      ) {
        return;
      }
      boundsPersistenceEnabled = true;
      if (boundsPersistFiber !== undefined) {
        const fiber = boundsPersistFiber;
        boundsPersistFiber = undefined;
        runFork(Fiber.interrupt(fiber));
      }
      boundsPersistFiber = runFork(
        Effect.sleep(MAIN_WINDOW_BOUNDS_PERSIST_DEBOUNCE_MS).pipe(
          Effect.andThen(
            Effect.sync(() => {
              boundsPersistFiber = undefined;
              void persistCurrentBounds();
            }),
          ),
        ),
      );
    };
    const clearBoundsPersist = () => {
      if (boundsPersistFiber === undefined) {
        return;
      }
      const fiber = boundsPersistFiber;
      boundsPersistFiber = undefined;
      runFork(Fiber.interrupt(fiber));
    };
    const flushBoundsPersist = Effect.sync(() => {
      clearBoundsPersist();
      return persistCurrentBounds();
    }).pipe(
      Effect.flatMap((fiber) =>
        fiber === undefined ? Effect.void : Fiber.join(fiber).pipe(Effect.asVoid),
      ),
    );
    flushMainWindowBounds = flushBoundsPersist;

    yield* previewManager.setMainWindow(window);
    if (yield* Ref.get(desktopState.quitting)) {
      yield* electronWindow.destroyAll;
      return Option.none();
    }
    window.webContents.on("will-attach-webview", (event, webPreferences, params) => {
      if (
        typeof params.partition !== "string" ||
        !previewManager.isBrowserPartition(params.partition)
      ) {
        event.preventDefault();
        return;
      }
      // The guest always runs the app's own preload, whatever the element asked for.
      webPreferences.preload = environment.previewPickPreloadPath;
      webPreferences.sandbox = true;
      webPreferences.nodeIntegration = false;
      webPreferences.nodeIntegrationInSubFrames = false;
      webPreferences.contextIsolation = true;
      webPreferences.disableHtmlFullscreenWindowResize = true;
      if (previewPasskeys.bridgeEnabled) {
        webPreferences.additionalArguments = [
          ...(webPreferences.additionalArguments ?? []),
          PASSKEY_BRIDGE_ARGUMENT,
        ];
      }
      if (!primaryPaste.enabled) {
        webPreferences.additionalArguments = [
          ...(webPreferences.additionalArguments ?? []),
          PRIMARY_PASTE_DISABLED_ARGUMENT,
        ];
      }
    });

    const contextMenuContents = new WeakSet<Electron.WebContents>();
    const installContextMenu = (
      ownerWindow: Electron.BrowserWindow,
      contents: Electron.WebContents,
      isBrowserContents = false,
    ): void => {
      if (contextMenuContents.has(contents)) return;
      contextMenuContents.add(contents);
      contents.on("context-menu", (event, params) => {
        event.preventDefault();
        if (contents.isDestroyed() || ownerWindow.isDestroyed()) return;
        // Right-clicking a guest may leave native editing roles targeting the host renderer.
        contents.focus();

        const menuTemplate: Electron.MenuItemConstructorOptions[] = [];

        if (isBrowserContents) {
          menuTemplate.push(
            {
              label: m(msg("Reload")),
              click: () => {
                if (!contents.isDestroyed()) contents.reload();
              },
            },
            { type: "separator" },
          );
        }

        if (params.misspelledWord) {
          for (const suggestion of params.dictionarySuggestions.slice(0, 5)) {
            menuTemplate.push({
              label: suggestion,
              click: () => {
                if (!contents.isDestroyed()) contents.replaceMisspelling(suggestion);
              },
            });
          }
          if (params.dictionarySuggestions.length === 0) {
            menuTemplate.push({ label: m(msg("No suggestions")), enabled: false });
          }
          menuTemplate.push({ type: "separator" });
        }

        if (Option.isSome(ElectronShell.parseSafeExternalUrl(params.linkURL))) {
          menuTemplate.push(
            {
              label: m(msg("Copy Link")),
              click: () => {
                void runPromise(electronShell.copyText(params.linkURL));
              },
            },
            { type: "separator" },
          );
        }

        const mailtoAddress = parseMailtoAddress(params.linkURL);
        if (Option.isSome(mailtoAddress)) {
          menuTemplate.push(
            {
              label: m(msg("Copy Email Address")),
              click: () => {
                void runPromise(electronShell.copyText(mailtoAddress.value));
              },
            },
            { type: "separator" },
          );
        }

        if (params.mediaType === "image") {
          menuTemplate.push({
            label: m(msg("Copy Image")),
            click: () => {
              void runPromise(
                Effect.tryPromise({
                  try: () => copyContextMenuImage(contents, params),
                  catch: (cause) => new ContextMenuImageCopyError({ cause }),
                }).pipe(Effect.catch(() => logWindowWarning("failed to copy context-menu image"))),
              );
            },
          });
          menuTemplate.push({ type: "separator" });
        }

        menuTemplate.push(
          {
            role: "cut",
            label: m(msg("Cut", { $context: "Edit menu item" })),
            enabled: params.editFlags.canCut,
          },
          {
            role: "copy",
            label: m(msg("Copy", { $context: "Edit menu item" })),
            enabled: params.editFlags.canCopy,
          },
          {
            role: "paste",
            label: m(msg("Paste", { $context: "Edit menu item" })),
            enabled: params.editFlags.canPaste,
          },
          {
            role: "selectAll",
            label: m(msg("Select All", { $context: "Edit menu item" })),
            enabled: params.editFlags.canSelectAll,
          },
        );

        const inspectorFrame = params.frame;
        if (
          !isBrowserContents &&
          inspectorFrame !== null &&
          isSameOriginRendererNavigation({
            applicationUrl,
            navigationUrl: inspectorFrame.url,
          })
        ) {
          menuTemplate.push(
            { type: "separator" },
            {
              label: m(msg("Inspect UI element")),
              click: () =>
                void runPromise(inspectContextMenuElement(inspectorFrame)),
            },
            {
              label: m(msg("Copy UI element details")),
              click: () =>
                void runPromise(
                  copyContextMenuElement(
                    inspectorFrame,
                    params.x,
                    params.y,
                    "details",
                    electronShell.copyText,
                  ),
                ),
            },
            {
              label: m(msg("Copy CSS selector")),
              click: () =>
                void runPromise(
                  copyContextMenuElement(
                    inspectorFrame,
                    params.x,
                    params.y,
                    "selector",
                    electronShell.copyText,
                  ),
                ),
            },
          );
        }

        void runPromise(
          electronMenu.popupTemplate({
            window: ownerWindow,
            template: menuTemplate,
            ...(params.frame ? { frame: params.frame } : {}),
          }),
        );
      });
      contents.on("did-create-window", (popup) => {
        installContextMenu(popup, popup.webContents, isBrowserContents);
      });
    };
    installContextMenu(window, window.webContents);
    window.webContents.on("did-attach-webview", (_event, contents) => {
      installContextMenu(window, contents, true);
      void runPromise(previewManager.prepareWebview(contents));
    });

    // Popups from every frame in this window arrive here without a caller, so only web links
    // pass. The app opens editors and other applications over IPC.
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (Option.isSome(ElectronShell.parseWebExternalUrl(url))) {
        void runPromise(electronShell.openExternal(url));
      }
      return { action: "deny" };
    });
    // Chromium asks this before handing a navigation to an OS protocol handler, and grants it
    // when nothing answers. External links are opened through ElectronShell only.
    window.webContents.session.setPermissionRequestHandler((_contents, permission, callback) =>
      callback(permission !== "openExternal"),
    );
    window.webContents.on("will-navigate", (event, url) => {
      if (
        isSameOriginRendererNavigation({
          applicationUrl,
          navigationUrl: url,
        })
      ) {
        return;
      }

      event.preventDefault();
      if (Option.isSome(ElectronShell.parseSafeExternalUrl(url))) {
        void runPromise(electronShell.openExternal(url));
      }
    });

    const quitShortcutHandler = makeQuitShortcutHandler({
      platform: environment.platform,
      getMode: () =>
        runPromise(
          Effect.map(
            clientSettings.get,
            Option.match({
              onNone: () => DEFAULT_CLIENT_SETTINGS.confirmQuit,
              onSome: (settings) => settings.confirmQuit,
            }),
          ),
        ),
      notify: (hint) => {
        if (!window.isDestroyed()) {
          window.webContents.send(QUIT_SHORTCUT_CHANNEL, hint);
        }
      },
      // Hold focus until shortcut release so remaining repeats cannot reach the next app.
      concealWindow: () => concealPendingQuitWindow(window),
      quit: () => {
        void runPromise(electronApp.quit);
      },
    });
    window.webContents.on("before-input-event", (event, input) => {
      quitShortcutHandler(event, input);
      if (window.isDestroyed()) return;
      // Cmd/Ctrl+W reaches the renderer; DevTools uses the native menu shortcut.
      window.webContents.setIgnoreMenuShortcuts(
        (environment.platform === "darwin" ? input.meta : input.control) &&
          !input.alt &&
          !input.shift &&
          input.key.toLowerCase() === "w",
      );
      // A held Cmd/Ctrl+W closes one tab or terminal, not each one behind it.
      if (input.type !== "keyDown" || !input.isAutoRepeat) return;
      const modifier = environment.platform === "darwin" ? input.meta : input.control;
      if (modifier && !input.alt && !input.shift && input.key.toLowerCase() === "w") {
        event.preventDefault();
      }
    });
    window.webContents.on("input-event", (_event, input) => {
      if (window.isDestroyed()) return;
      if (input.type === "gestureScrollBegin") {
        window.webContents.send(TRACKPAD_SCROLL_BEGIN_CHANNEL);
      } else if (input.type === "gestureScrollEnd") {
        window.webContents.send(TRACKPAD_SCROLL_END_CHANNEL);
      }
    });
    // Ctrl+wheel bypasses menus; guest contents emit their own zoom-changed event.
    window.webContents.on("zoom-changed", (_event, direction) => {
      if (window.isDestroyed()) return;
      runFork(zoomWindow(window, direction));
    });

    // The renderer titles the window after the open thread; only a blank title
    // falls back to the app name.
    window.on("page-title-updated", (event, title) => {
      if (title.trim() !== "") return;
      event.preventDefault();
      window.setTitle(environment.displayName);
    });
    window.on("resize", scheduleBoundsPersist);
    window.on("move", scheduleBoundsPersist);
    window.on("maximize", scheduleBoundsPersist);
    window.on("unmaximize", scheduleBoundsPersist);
    window.on("close", () => {
      runFork(flushBoundsPersist);
    });

    if (environment.platform === "darwin") {
      // Mouse drivers can deliver Back/Forward as macOS swipe gestures instead of buttons.
      window.on("swipe", (_event, direction) => {
        const history = window.webContents.navigationHistory;
        if (direction === "left" && history.canGoBack()) history.goBack();
        else if (direction === "right" && history.canGoForward()) history.goForward();
      });
      window.on("enter-full-screen", () => {
        window.webContents.send(WINDOW_FULLSCREEN_STATE_CHANNEL, true);
      });
      window.on("leave-full-screen", () => {
        syncMacosWindowButtons(window);
        window.webContents.send(WINDOW_FULLSCREEN_STATE_CHANNEL, false);
      });
    }

    let developmentLoadRetryIndex = 0;
    let developmentLoadRetryFiber: Fiber.Fiber<void, never> | undefined;
    let rendererRecoveryTimestamps: number[] = [];
    const clearDevelopmentLoadRetry = () => {
      if (developmentLoadRetryFiber === undefined) {
        return;
      }
      const retryFiber = developmentLoadRetryFiber;
      developmentLoadRetryFiber = undefined;
      runFork(Fiber.interrupt(retryFiber));
    };
    const loadApplication = () => {
      if (window.isDestroyed()) {
        return;
      }
      void window.loadURL(applicationUrl).catch(() => undefined);
    };
    const scheduleDevelopmentLoadRetry = () => {
      if (developmentLoadRetryFiber !== undefined || window.isDestroyed()) {
        return undefined;
      }

      const retryIndex = Math.min(
        developmentLoadRetryIndex,
        DEVELOPMENT_LOAD_RETRY_DELAYS_MS.length - 1,
      );
      const retryInMs = DEVELOPMENT_LOAD_RETRY_DELAYS_MS[retryIndex] ?? 2_000;
      developmentLoadRetryIndex += 1;
      developmentLoadRetryFiber = runFork(
        Effect.sleep(retryInMs).pipe(
          Effect.andThen(
            Effect.sync(() => {
              developmentLoadRetryFiber = undefined;
              if (!window.isDestroyed()) {
                loadApplication();
              }
            }),
          ),
        ),
      );
      return retryInMs;
    };

    window.webContents.on("did-finish-load", () => {
      if (
        environment.isDevelopment &&
        !isSameOriginRendererNavigation({
          applicationUrl,
          navigationUrl: window.webContents.getURL(),
        })
      ) {
        return;
      }
      clearDevelopmentLoadRetry();
      developmentLoadRetryIndex = 0;
      if (environment.platform === "darwin") syncMacosWindowButtons(window);
    });
    window.webContents.on(
      "did-fail-load",
      (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        if (!isMainFrame) {
          return;
        }
        const retryInMs =
          environment.isDevelopment &&
          isRetryableDevelopmentRendererLoadFailure({
            applicationUrl,
            errorCode,
            isMainFrame,
            validatedUrl: validatedURL,
          })
            ? scheduleDevelopmentLoadRetry()
            : undefined;
        void runPromise(
          logWindowWarning("main window failed to load", {
            errorCode,
            errorDescription,
            url: validatedURL,
            ...(retryInMs === undefined ? {} : { retryInMs }),
          }),
        );
      },
    );
    window.webContents.on("render-process-gone", (_event, details) => {
      const recoverable =
        details.reason === "crashed" ||
        details.reason === "oom" ||
        details.reason === "killed" ||
        details.reason === "abnormal-exit";

      runFork(
        Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis;
          rendererRecoveryTimestamps = rendererRecoveryTimestamps.filter(
            (timestamp) => now - timestamp < RENDERER_RECOVERY_WINDOW_MS,
          );
          const shouldRecover = recoverable && !window.isDestroyed();
          // Past the budget, wait for the oldest attempt to leave the window instead of
          // giving up, so a crash loop backs off but never leaves the window blank.
          const oldestAttempt =
            rendererRecoveryTimestamps.length >= RENDERER_RECOVERY_MAX_ATTEMPTS
              ? rendererRecoveryTimestamps[
                  rendererRecoveryTimestamps.length - RENDERER_RECOVERY_MAX_ATTEMPTS
                ]
              : undefined;
          const reloadInMs =
            oldestAttempt === undefined
              ? RENDERER_RECOVERY_RELOAD_DELAY_MS
              : Math.max(
                  RENDERER_RECOVERY_RELOAD_DELAY_MS,
                  oldestAttempt + RENDERER_RECOVERY_WINDOW_MS - now,
                );
          yield* logWindowWarning("main window render process gone", {
            reason: details.reason,
            exitCode: details.exitCode,
            recovering: shouldRecover,
            ...(shouldRecover ? { reloadInMs } : {}),
          });
          if (!shouldRecover) {
            return;
          }
          rendererRecoveryTimestamps.push(now + reloadInMs);
          yield* Effect.sleep(reloadInMs);
          if (!window.isDestroyed()) {
            loadApplication();
          }
        }),
      );
    });

    const revealSubscribers: RevealSubscription[] = [(fire) => window.once("ready-to-show", fire)];
    if (environment.platform === "linux") {
      revealSubscribers.push((fire) => window.webContents.once("did-finish-load", fire));
    }
    let rendererReady = false;
    let firstRevealComplete = false;
    const revealWhenReady = Effect.gen(function* () {
      if (
        !rendererReady ||
        firstRevealComplete ||
        window.isDestroyed() ||
        (yield* Ref.get(desktopState.quitting))
      )
        return;
      firstRevealComplete = true;
      pendingMainReveals.delete(window);
      window.webContents.setBackgroundThrottling(true);
      if (persistedSettings.mainWindowMaximized) window.maximize();
      yield* electronWindow.reveal(window);
      yield* dismissConnectingSplash;
    });
    pendingMainReveals.set(window, revealWhenReady);
    bindFirstRevealTrigger(revealSubscribers, () => {
      rendererReady = true;
      void runPromise(revealWhenReady);
    });

    // Desktop IPC only answers the main window, so register it before its renderer can call in.
    yield* electronWindow.setMain(window);
    remoteRequestHeaderOwner = window;
    const detachRemoteRequestHeaders = installMainWindowRemoteRequestHeaderPolicy(
      window.webContents.session,
      {
        desktopOrigin: getDesktopOrigin(environment.isDevelopment),
        mainWebContentsId: window.webContents.id,
        clerkFrontendApiHostname: DesktopClerk.desktopClerkFrontendApiHostname,
        devServerOrigin: Option.getOrUndefined(
          Option.map(environment.devServerUrl, (url) => url.origin),
        ),
        isDevelopment: environment.isDevelopment,
      },
    );
    loadApplication();
    if (environment.isDevelopment) {
      window.webContents.openDevTools({ mode: "detach" });
    }

    window.on("closed", () => {
      if (!backendHasStarted) mainClosedDuringStartup = true;
      clearDevelopmentLoadRetry();
      clearBoundsPersist();
      if (remoteRequestHeaderOwner === window) {
        remoteRequestHeaderOwner = null;
        detachRemoteRequestHeaders();
      }
      void runPromise(electronWindow.clearMain(Option.some(window)));
    });

    return Option.some(window);
  });

  const createMain = Effect.gen(function* () {
    const window = yield* createWindow();
    if (Option.isSome(window)) {
      mainClosedDuringStartup = false;
      yield* logWindowInfo("main window created");
    }
    return window;
  }).pipe(Effect.withSpan("desktop.window.createMain"));

  const ensureMain = Effect.gen(function* () {
    if (yield* Ref.get(desktopState.quitting)) return Option.none<Electron.BrowserWindow>();
    const existingWindow = yield* electronWindow.main;
    if (Option.isSome(existingWindow)) {
      return existingWindow;
    }
    return yield* createMain;
  }).pipe(mainWindowMutex.withPermits(1), Effect.withSpan("desktop.window.ensureMain"));

  const requireWindow = (window: Option.Option<Electron.BrowserWindow>) =>
    Option.match(window, {
      onNone: () => Effect.interrupt,
      onSome: Effect.succeed,
    });

  const revealOrCreateMain = Effect.gen(function* () {
    const window = yield* ensureMain.pipe(Effect.flatMap(requireWindow));
    yield* revealMain(window);
    return window;
  }).pipe(Effect.withSpan("desktop.window.revealOrCreateMain"));

  const waitingForBackend = Effect.gen(function* () {
    if (yield* Ref.get(backendReadyRef)) return false;
    return (yield* desktopSettings.get).localEnvironmentEnabled;
  });

  const createMainIfBackendReady = Effect.gen(function* () {
    if (yield* Ref.get(desktopState.quitting)) return;
    if (yield* waitingForBackend) return;
    yield* ensureMain;
  }).pipe(Effect.withSpan("desktop.window.createMainIfBackendReady"));

  const showConnectingSplash = Effect.gen(function* () {
    if (yield* Ref.get(desktopState.quitting)) return;
    const existingSplash = yield* Ref.get(splashWindowRef);
    if (Option.isSome(existingSplash)) return;
    const existingWindow = yield* electronWindow.currentMainOrFirst;
    if (Option.isSome(existingWindow)) return;

    const shouldUseDarkColors = yield* electronTheme.shouldUseDarkColors;
    if (yield* Ref.get(desktopState.quitting)) return;
    const splash = yield* electronWindow.create({
      width: 360,
      height: 220,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      frame: false,
      center: true,
      show: false,
      skipTaskbar: false,
      backgroundColor: getInitialWindowBackgroundColor(shouldUseDarkColors),
      title: environment.displayName,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    if (yield* Ref.get(desktopState.quitting)) {
      yield* electronWindow.destroyAll;
      return;
    }
    yield* rendererHistory.register(splash.webContents, { surface: "splash" });
    yield* Ref.set(splashWindowRef, Option.some(splash));
    let renderedUrl: string | undefined;
    const progressFiber = runFork(
      Effect.gen(function* () {
        if (splash.isDestroyed() || (yield* Ref.get(desktopState.quitting))) return;
        const progress = yield* Ref.get(desktopState.databaseMigrationProgress);
        const url = buildConnectingSplashDataUrl(shouldUseDarkColors, progress);
        if (url === renderedUrl) return;
        const loaded = yield* Effect.promise(() =>
          splash.loadURL(url).then(
            () => true,
            () => false,
          ),
        );
        if (loaded) renderedUrl = url;
      }).pipe(Effect.repeat(Schedule.spaced("1 second"))),
    );
    splash.once("closed", () => {
      runFork(
        Fiber.interrupt(progressFiber).pipe(
          Effect.andThen(Ref.set(splashWindowRef, Option.none())),
        ),
      );
    });
    splash.once("ready-to-show", () => {
      if (!splash.isDestroyed()) {
        splash.show();
      }
    });
    yield* logWindowInfo("connecting splash shown");
  }).pipe(
    Effect.catch((error) =>
      logWindowWarning("failed to show connecting splash", { message: error.message }),
    ),
    Effect.withSpan("desktop.window.showConnectingSplash"),
  );

  const dispatchRendererEvent = Effect.fn("desktop.window.dispatchRendererEvent")(function* (
    channel: string,
    payload: unknown,
    { reveal = true }: { readonly reveal?: boolean } = {},
  ) {
    if (yield* Ref.get(desktopState.quitting)) return;
    // Only the main renderer loads the app preload that listens on these channels.
    const existingWindow = yield* electronWindow.main;
    if (Option.isNone(existingWindow) && (!reveal || (yield* waitingForBackend))) return;
    const window = Option.isSome(existingWindow) ? existingWindow : yield* ensureMain;
    if (Option.isNone(window) || window.value.isDestroyed()) return;
    const targetWindow = window.value;
    const send = Effect.sync(() => {
      if (!targetWindow.isDestroyed()) targetWindow.webContents.send(channel, payload);
    });
    // Send before best-effort reveal; another process may refuse to yield foreground focus.
    const dispatch = reveal
      ? send.pipe(Effect.andThen(revealMain(targetWindow).pipe(Effect.ignoreCause)))
      : send;
    if (targetWindow.webContents.isLoadingMainFrame()) {
      targetWindow.webContents.once("did-finish-load", () => void runPromise(dispatch));
      return;
    }
    yield* dispatch;
  });

  return DesktopWindow.of({
    createMain: createMain.pipe(Effect.flatMap(requireWindow)),
    ensureMain: ensureMain.pipe(Effect.flatMap(requireWindow)),
    revealOrCreateMain,
    prepareCaptureReveal: Effect.gen(function* () {
      const existingWindow = yield* currentMainWindow;
      if (Option.isSome(existingWindow) && !pendingMainReveals.has(existingWindow.value)) {
        yield* electronWindow.prepareReveal(existingWindow.value);
      }
    }),
    activate: Effect.gen(function* () {
      if (yield* Ref.get(desktopState.quitting)) return;
      const existingWindow = yield* currentMainWindow;
      if (Option.isSome(existingWindow)) {
        yield* revealMain(existingWindow.value);
        return;
      }
      if (mainClosedDuringStartup) {
        yield* ensureMain;
        return;
      }
      const backendReady = yield* Ref.get(backendReadyRef);
      if (!backendReady) {
        const splash = yield* Ref.get(splashWindowRef);
        if (Option.isSome(splash)) {
          yield* electronWindow.reveal(splash.value);
          return;
        }
      }
      yield* createMainIfBackendReady;
    }).pipe(Effect.withSpan("desktop.window.activate")),
    createMainIfBackendReady,
    showConnectingSplash,
    handleBackendReady: Effect.fn("desktop.window.handleBackendReady")(function* (httpBaseUrl) {
      backendHasStarted = true;
      yield* Ref.set(backendReadyRef, true);
      yield* logWindowInfo("backend ready", { source: "http", url: httpBaseUrl.href });
      if (!mainClosedDuringStartup) yield* createMainIfBackendReady;
    }),
    handleBackendNotReady: Ref.set(backendReadyRef, false).pipe(
      Effect.withSpan("desktop.window.handleBackendNotReady"),
    ),
    flushMainWindowBounds: Effect.suspend(() => flushMainWindowBounds).pipe(
      Effect.withSpan("desktop.window.flushMainWindowBounds"),
    ),
    dispatchMenuAction: Effect.fn("desktop.window.dispatchMenuAction")(function* (action, options) {
      yield* Effect.annotateCurrentSpan({ action });
      yield* dispatchRendererEvent(MENU_ACTION_CHANNEL, action, options);
    }),
    dispatchSnapShotEvent: Effect.fn("desktop.window.dispatchSnapShotEvent")(function* (event) {
      yield* Effect.annotateCurrentSpan({
        event: event.type,
        captureId: "id" in event ? (event.id ?? null) : null,
      });
      yield* dispatchRendererEvent(SNAP_SHOT_EVENT_CHANNEL, event, {
        reveal: event.type === "started",
      });
    }),
    zoomMain: Effect.fn("desktop.window.zoomMain")(function* (direction) {
      yield* Effect.annotateCurrentSpan({ direction });
      const window = yield* electronWindow.main;
      if (Option.isNone(window) || window.value.isDestroyed()) {
        return;
      }
      yield* zoomWindow(window.value, direction);
    }),
    runMainContentsCommand: Effect.fn("desktop.window.runMainContentsCommand")(function* (command) {
      yield* Effect.annotateCurrentSpan({ command });
      // A focused OAuth popup must not receive the app's Reload command.
      const window = yield* electronWindow.main;
      if (Option.isNone(window) || window.value.isDestroyed()) return;
      const webContents = window.value.webContents;
      if (command === "reload") webContents.reload();
      else if (command === "forceReload") webContents.reloadIgnoringCache();
      else webContents.toggleDevTools();
    }),
    syncAppearance: Effect.gen(function* () {
      const shouldUseDarkColors = yield* electronTheme.shouldUseDarkColors;
      yield* electronWindow.syncAllAppearance((window, { titleBarOverlay }) =>
        syncWindowAppearance(window, titleBarOverlay, shouldUseDarkColors, environment.platform),
      );
    }).pipe(Effect.withSpan("desktop.window.syncAppearance")),
  });
});

export const layer = Layer.effect(DesktopWindow, make);
