import { ProviderDriverKind, type SidebarThreadCardFields } from "@t3tools/contracts";
import { CircleDotIcon, TerminalIcon } from "lucide-react";
import { msg, useMessages } from "gt-react";

import { EnvironmentMachineIcon } from "../EnvironmentMachineIcon";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
import { PullRequestGlyph } from "../pullRequest/pullRequestIcons";
import { Switch } from "../ui/switch";

const CARD_FIELD_OPTIONS = [
  { key: "projectName", label: msg("Project name") },
  { key: "environmentName", label: msg("Machine name") },
  { key: "activityTime", label: msg("Activity time") },
  { key: "providerIcons", label: msg("Provider icons") },
  { key: "pullRequest", label: msg("Pull request badges") },
  { key: "issues", label: msg("Issue badges") },
  { key: "diffStats", label: msg("Git change counts") },
  { key: "terminalStatus", label: msg("Terminal status") },
] as const;

export function SidebarThreadCardSettings(props: {
  fields: SidebarThreadCardFields;
  onChange: (field: keyof SidebarThreadCardFields, checked: boolean) => void;
}) {
  const messages = useMessages();
  const hasMeta =
    props.fields.environmentName ||
    props.fields.terminalStatus ||
    props.fields.pullRequest ||
    props.fields.issues ||
    props.fields.diffStats;

  return (
    <div className="space-y-3 rounded-xl border border-border/60 p-3">
      <div className="grid gap-x-5 gap-y-2 sm:grid-cols-2">
        {CARD_FIELD_OPTIONS.map(({ key, label }) => (
          <label key={key} className="flex min-h-8 items-center justify-between gap-3 text-sm">
            <span>{messages(label)}</span>
            <Switch
              checked={props.fields[key]}
              onCheckedChange={(checked) => props.onChange(key, checked)}
              aria-label={messages(label)}
            />
          </label>
        ))}
      </div>

      <div
        role="group"
        aria-label={messages(msg("Preview"))}
        className="space-y-1.5 rounded-lg bg-sidebar p-2.5"
      >
        <div className="flex h-5 min-w-0 items-center gap-2 text-xs text-secondary-label">
          {props.fields.projectName ? (
            <span className="min-w-0 flex-1 truncate">{"terminal_tui"}</span>
          ) : (
            <span className="flex-1" />
          )}
          {props.fields.providerIcons ? (
            <ProviderInstanceIcon
              driverKind={ProviderDriverKind.make("codex")}
              displayName="Codex"
              size="compact"
            />
          ) : null}
          {props.fields.activityTime ? (
            <span className="shrink-0 text-muted-foreground">{messages(msg("now"))}</span>
          ) : null}
        </div>
        <div className="flex h-5 min-w-0 items-center text-sm font-medium text-foreground">
          <span className="truncate">{messages(msg("Clone Project Size Check"))}</span>
        </div>
        {hasMeta ? (
          <div className="flex min-h-4 min-w-0 items-center gap-1.5 text-xs text-secondary-label">
            {props.fields.environmentName ? (
              <>
                <EnvironmentMachineIcon
                  aria-hidden
                  kind="desktop"
                  className="size-3.5 shrink-0 text-icon-muted"
                />
                <span className="min-w-0 flex-1 truncate text-foreground/75">{"win6970"}</span>
              </>
            ) : (
              <span className="flex-1" />
            )}
            {props.fields.terminalStatus ? (
              <TerminalIcon aria-label={messages(msg("Terminal running"))} className="size-3.5" />
            ) : null}
            {props.fields.pullRequest ? (
              <span className="inline-flex items-center gap-1 rounded px-1 text-secondary-label">
                <PullRequestGlyph.pullRequest aria-hidden className="size-3" />
                {"#42"}
              </span>
            ) : null}
            {props.fields.issues ? (
              <span className="inline-flex items-center gap-1 rounded px-1 text-secondary-label">
                <CircleDotIcon aria-hidden className="size-3" />
                {"T3-18"}
              </span>
            ) : null}
            {props.fields.diffStats ? (
              <span className="shrink-0 font-mono">
                <span className="text-diff-addition-foreground">+12</span>{" "}
                <span className="text-diff-deletion-foreground">−3</span>
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {messages(msg("Preview updates as you change which details appear on sidebar cards."))}
      </p>
    </div>
  );
}
