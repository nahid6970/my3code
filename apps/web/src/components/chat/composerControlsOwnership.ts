/**
 * The access chip stays beside reasoning even at the default mode. When controls overflow,
 * permissions move with the access block into the overflow menu.
 */
export function resolveComposerControlsOwnership(input: {
  readonly collapsed: boolean;
  /** How many trailing blocks the width measurement moved into the overflow menu. */
  readonly measuredHiddenBlockCount: number;
}) {
  const accessDisplay = input.collapsed ? ("icon" as const) : ("label" as const);
  const showModeBlock = true;
  const blockIds = ["effort", ...(showModeBlock ? ["mode"] : [])];
  const hiddenBlockIds = blockIds.slice(
    Math.max(0, blockIds.length - input.measuredHiddenBlockCount),
  );
  const modeHidden = hiddenBlockIds.includes("mode");
  const effortHidden = hiddenBlockIds.includes("effort");
  const overflowShowsPermissions = modeHidden;
  return {
    accessDisplay,
    showModeBlock,
    hiddenBlockCount: hiddenBlockIds.length,
    hiddenBlockIds,
    overflowShowsEffort: effortHidden,
    overflowShowsPermissions,
  };
}
