import type { ModelSelection, ProviderInstanceId, RuntimeMode } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { T, useGT, useMessages } from "gt-react";
import { type ComponentProps, memo, use, useId, useRef } from "react";

import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { Menu, MenuPopup, MenuTrigger } from "../ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { ComposerControl, ComposerControlIcon } from "./ComposerControl";
import { focusRequestedPermission, useComposerMenuProps } from "./composerEventScope";
import { ComposerPrimaryActions } from "./ComposerPrimaryActions";
import { resolveModelPickerSelectedModel } from "./ModelPickerContent";
import { ProviderModelPicker } from "./ProviderModelPicker";
import { resolveRuntimeModeOption, runtimeModeConfig } from "./runtimeModeConfig";
import { useComposerMenuState } from "./useComposerMenuState";
import {
  RuntimeModeLimitsTargetContext,
  useProviderRuntimeModeLimits,
} from "../../state/runtimeModeLimits";

export type RuntimeModeOption = {
  mode: RuntimeMode;
  disabledReason?: string;
} & (typeof runtimeModeConfig)[RuntimeMode];
export const ComposerFooterModeControls = memo(function ComposerFooterModeControls(props: {
  runtimeMode: RuntimeMode;
  runtimeModeOptions: ReadonlyArray<RuntimeModeOption>;
  size?: "sm" | "xs";
  hidden?: boolean;
  /** How the permissions chip shows: hidden while the thread matches the user's default. */
  accessDisplay?: "label" | "icon" | "hidden";
  /** Draw the icon in the label color, not muted (the mode differs from the user's default). */
  emphasized?: boolean;
  onRuntimeModeChange: (mode: RuntimeMode) => void;
}) {
  const gt = useGT();
  const messages = useMessages();
  const size = props.size ?? "sm";
  const accessDisplay = props.accessDisplay ?? "label";
  const composerFloatingLayerProps = useComposerMenuProps();
  const [open, setOpen] = useComposerMenuState(props.hidden);
  const permissionsChipRef = useRef<HTMLButtonElement>(null);
  const runtimeModeOption =
    props.runtimeModeOptions.find((option) => option.mode === props.runtimeMode) ??
    resolveRuntimeModeOption("approval-required", messages);
  const RuntimeModeIcon = runtimeModeOption.icon;
  // The chip opens the same Permissions toggle used in the model picker and the overflow menu.
  const permissionsTooltip = gt("Permissions: {mode}. {description}", {
    mode: runtimeModeOption.label,
    description: runtimeModeOption.description,
  });
  const permissionsChip = (
    <Menu
      open={open}
      onOpenChange={setOpen}
      onOpenChangeComplete={(isOpen) =>
        focusRequestedPermission(isOpen, permissionsChipRef.current)
      }
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <MenuTrigger
              render={
                <ComposerControl
                  ref={permissionsChipRef}
                  data-composer-shortcut="composer.mode"
                  size={size}
                  // Mirrors the model trigger's trailing pe-1 so the gaps on both sides of the chip match.
                  className="ps-1.5"
                  aria-label={gt("Permissions: {mode}", { mode: runtimeModeOption.label })}
                />
              }
            />
          }
        >
          <ComposerControlIcon
            icon={RuntimeModeIcon}
            size={size}
            // Match the label, not full foreground: the chip's presence already marks the mode.
            {...(props.emphasized ? { className: "text-current" } : {})}
          />
          <span
            data-composer-control-label
            className={accessDisplay === "icon" ? "sr-only" : undefined}
          >
            {runtimeModeOption.label}
          </span>
        </TooltipTrigger>
        <TooltipPopup side="top">{permissionsTooltip}</TooltipPopup>
      </Tooltip>
      <MenuPopup align="start" {...composerFloatingLayerProps}>
        <ComposerPermissionsSection
          runtimeMode={props.runtimeMode}
          runtimeModeOptions={props.runtimeModeOptions}
          onRuntimeModeChange={props.onRuntimeModeChange}
        />
      </MenuPopup>
    </Menu>
  );

  return accessDisplay === "hidden" ? null : permissionsChip;
});

/**
 * Permission modes as one horizontal toggle, with the shown mode named below.
 * Each segment is a real menu radio item, so arrow keys reach it from the rest of the menu
 * and a pick closes the menu. Lives inside a Menu: the permissions chip, the model picker,
 * or the overflow menu.
 */
export function ComposerPermissionsSection(props: {
  runtimeMode: RuntimeMode;
  runtimeModeOptions: ReadonlyArray<RuntimeModeOption>;
  onRuntimeModeChange: (mode: RuntimeMode) => void;
}) {
  const gt = useGT();
  const descriptionId = useId();
  // Mounted only while a picker is open, so this asks the server again each time one opens.
  useProviderRuntimeModeLimits(use(RuntimeModeLimitsTargetContext), "picker");
  return (
    <div data-composer-permissions className="grid w-80 gap-1 p-1">
      <MenuPrimitive.RadioGroup
        aria-label={gt("Permissions")}
        value={props.runtimeMode}
        onValueChange={(value: RuntimeMode) => {
          if (value !== props.runtimeMode) props.onRuntimeModeChange(value);
        }}
        className="flex flex-col gap-0.5"
      >
        {props.runtimeModeOptions.map((option) => {
          const OptionIcon = option.icon;
          return (
            <MenuPrimitive.RadioItem
              key={option.mode}
              value={option.mode}
              disabled={option.disabledReason !== undefined}
              label={option.label}
              aria-label={option.label}
              aria-describedby={`${descriptionId}-${option.mode}`}
              closeOnClick
              className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-muted-foreground outline-none data-disabled:cursor-not-allowed data-disabled:opacity-40 data-checked:bg-input/72 data-checked:text-foreground data-highlighted:text-foreground not-data-checked:data-highlighted:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              <OptionIcon aria-hidden="true" className="size-4 shrink-0" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm leading-4">{option.label}</span>
                <span
                  id={`${descriptionId}-${option.mode}`}
                  className="line-clamp-2 text-muted-foreground text-xs leading-4"
                >
                  {option.disabledReason ?? option.description}
                </span>
              </span>
            </MenuPrimitive.RadioItem>
          );
        })}
      </MenuPrimitive.RadioGroup>
    </div>
  );
}

export const ComposerFooterPrimaryActions = memo(function ComposerFooterPrimaryActions(props: {
  children?: React.ReactNode;
  compact: boolean;
  canOperateThread: boolean;
  isPreparingWorktree: boolean;
  pendingAction: {
    questionIndex: number;
    isLastQuestion: boolean;
    canAdvance: boolean;
    isResponding: boolean;
    isComplete: boolean;
  } | null;
  isRunning: boolean;
  canInterrupt: boolean;
  runId: string | null;
  followUpBehavior: "queue" | "steer";
  canSteer: boolean;
  alternateShortcutLabel: string | null;
  voiceInputActive?: boolean;
  isSendBusy: boolean;
  isSendHeld?: boolean;
  sendDisabledReason: string | null;
  isEnvironmentUnavailable: boolean;
  hasSendableContent: boolean;
  canResume: boolean;
  preserveComposerFocusOnPointerDown?: boolean;
  isEditingQueuedMessage: boolean;
  onSubmitMessage: React.MouseEventHandler<HTMLButtonElement>;
  onResume: () => void;
  onPreviousPendingQuestion: () => void;
  onInterrupt: () => void;
  compactBeforeSendTokens: number | null;
  hideCompactToggle: boolean;
  keepFullHistory: boolean;
  onToggleKeepFullHistory: () => void;
}) {
  return (
    <>
      <ComposerPrimaryActions
        compact={props.compact}
        canOperateThread={props.canOperateThread}
        pendingAction={props.pendingAction}
        isRunning={props.isRunning}
        canInterrupt={props.canInterrupt}
        runId={props.runId}
        followUpBehavior={props.followUpBehavior}
        canSteer={props.canSteer}
        alternateShortcutLabel={props.alternateShortcutLabel}
        voiceInputActive={props.voiceInputActive ?? false}
        isSendBusy={props.isSendBusy}
        isSendHeld={props.isSendHeld ?? false}
        sendDisabledReason={props.sendDisabledReason}
        isEnvironmentUnavailable={props.isEnvironmentUnavailable}
        isPreparingWorktree={props.isPreparingWorktree}
        hasSendableContent={props.hasSendableContent}
        canResume={props.canResume}
        preserveComposerFocusOnPointerDown={props.preserveComposerFocusOnPointerDown ?? false}
        isEditingQueuedMessage={props.isEditingQueuedMessage}
        onSubmitMessage={props.onSubmitMessage}
        onResume={props.onResume}
        onPreviousPendingQuestion={props.onPreviousPendingQuestion}
        onInterrupt={props.onInterrupt}
        compactBeforeSendTokens={props.compactBeforeSendTokens}
        hideCompactToggle={props.hideCompactToggle}
        keepFullHistory={props.keepFullHistory}
        onToggleKeepFullHistory={props.onToggleKeepFullHistory}
      >
        {props.children}
      </ComposerPrimaryActions>
    </>
  );
});

/**
 * The composer's model picker. It owns the single- and multi-model selection
 * handlers so they are cached against the selection state, not rebuilt on
 * every ChatComposer render.
 */
export function ComposerModelPicker({
  multipleModelsEnabled,
  multipleModelSelections,
  onMultipleModelSelectionsChange,
  selectedModelSelection,
  onProviderModelSelect,
  ...pickerProps
}: Omit<
  ComponentProps<typeof ProviderModelPicker>,
  "selectedModels" | "onToggleModel" | "onInstanceModelChange"
> & {
  readonly multipleModelsEnabled: boolean;
  readonly multipleModelSelections: ReadonlyArray<ModelSelection> | null;
  readonly onMultipleModelSelectionsChange: (
    selections: ReadonlyArray<ModelSelection> | null,
  ) => void;
  readonly selectedModelSelection: ModelSelection;
  readonly onProviderModelSelect: (
    instanceId: ProviderInstanceId,
    model: string,
    options?: { focusComposer?: boolean },
  ) => void;
}) {
  const { instanceEntries, modelOptionsByInstance } = pickerProps;
  const toggleModel = (instanceId: ProviderInstanceId, model: string) => {
    const current = multipleModelSelections ?? [selectedModelSelection];
    const matchesModel = (selection: ModelSelection) => {
      if (selection.instanceId !== instanceId) return false;
      const entry = instanceEntries.find((entry) => entry.instanceId === selection.instanceId);
      const resolvedModel = resolveModelPickerSelectedModel({
        driverKind: entry?.driverKind,
        model: selection.model,
        options: modelOptionsByInstance?.get(selection.instanceId) ?? [],
      });
      return (resolvedModel?.slug ?? selection.model) === model;
    };
    const exists = current.some(matchesModel);
    const next = exists
      ? current.filter((selection) => !matchesModel(selection))
      : [...current, createModelSelection(instanceId, model)];
    if (next.length > 1) {
      onMultipleModelSelectionsChange(next);
    } else {
      onMultipleModelSelectionsChange(null);
      const remaining = next[0] ?? selectedModelSelection;
      onProviderModelSelect(remaining.instanceId, remaining.model, {
        focusComposer: false,
      });
    }
  };
  return (
    <ProviderModelPicker
      {...pickerProps}
      {...(multipleModelsEnabled
        ? {
            ...(multipleModelSelections !== null
              ? { selectedModels: multipleModelSelections }
              : {}),
            onToggleModel: toggleModel,
          }
        : {})}
      onInstanceModelChange={(instanceId, model) => {
        onMultipleModelSelectionsChange(null);
        onProviderModelSelect(instanceId, model);
      }}
    />
  );
}
