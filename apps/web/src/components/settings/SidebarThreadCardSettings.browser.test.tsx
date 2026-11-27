import type { SidebarThreadCardFields } from "@t3tools/contracts";
import { expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { useState } from "react";

import { render } from "../../../test/render";
import { SidebarThreadCardSettings } from "./SidebarThreadCardSettings";

function SettingsPreviewHarness() {
  const [fields, setFields] = useState<SidebarThreadCardFields>({
    projectName: true,
    environmentName: true,
    activityTime: true,
    providerIcons: true,
    pullRequest: true,
    issues: true,
    diffStats: true,
    terminalStatus: true,
  });

  return (
    <SidebarThreadCardSettings
      fields={fields}
      onChange={(field, checked) => setFields((current) => ({ ...current, [field]: checked }))}
    />
  );
}

it("updates the card preview when machine names are hidden", async () => {
  await using screen = await render(<SettingsPreviewHarness />, { router: false });
  const preview = screen.getByRole("group", { name: "Preview" });

  await expect.element(preview).toHaveTextContent("win6970");
  await userEvent.click(page.getByRole("switch", { name: "Machine name" }));
  await expect.element(preview).not.toHaveTextContent("win6970");
  await expect.element(preview).toHaveTextContent("Clone Project Size Check");
});
