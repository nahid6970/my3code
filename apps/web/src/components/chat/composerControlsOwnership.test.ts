import { describe, expect, it } from "vite-plus/test";

import { resolveComposerControlsOwnership } from "./composerControlsOwnership";

const base = {
  collapsed: false,
  measuredHiddenBlockCount: 0,
};

describe("resolveComposerControlsOwnership", () => {
  it("shows the access chip after reasoning even at the default mode", () => {
    const result = resolveComposerControlsOwnership(base);
    expect(result).toMatchObject({
      accessDisplay: "label",
      showModeBlock: true,
      hiddenBlockIds: [],
      overflowShowsPermissions: false,
    });
  });

  it("keeps the labelled access chip when the selected mode differs", () => {
    const result = resolveComposerControlsOwnership(base);
    expect(result).toMatchObject({
      accessDisplay: "label",
      showModeBlock: true,
    });
  });

  it("gives an overflowed chip's Permissions to the overflow menu", () => {
    const result = resolveComposerControlsOwnership({
      ...base,
      measuredHiddenBlockCount: 1,
    });
    expect(result.hiddenBlockIds).toEqual(["mode"]);
    expect(result.overflowShowsPermissions).toBe(true);
  });

  it("shows the non-default chip as an icon in the compacted row", () => {
    const result = resolveComposerControlsOwnership({
      ...base,
      collapsed: true,
    });
    expect(result.accessDisplay).toBe("icon");
  });
});
