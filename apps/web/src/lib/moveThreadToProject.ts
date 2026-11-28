import type { ProjectId, ScopedThreadRef } from "@t3tools/contracts";
import { readLocalApi } from "../localApi";
import { AsyncResult } from "effect/reactivity";
import * as Cause from "effect/Cause";

export async function moveThreadToProject(
  threadRef: ScopedThreadRef,
  targetProjectId: ProjectId
): Promise<AsyncResult.AsyncResult<void, Error>> {
  const api = readLocalApi();
  if (!api) {
    return AsyncResult.failure(
      Cause.fail(new Error("Local API is not available"))
    );
  }

  try {
    // Call the t3_thread_organize MCP tool with change_project action
    const result = await api.rpc.mcpToolCall({
      environmentId: threadRef.environmentId,
      toolName: "t3_thread_organize",
      arguments: {
        threadId: threadRef.threadId,
        action: "change_project",
        targetProjectId,
      },
    });

    if (!result.success) {
      return AsyncResult.failure(
        Cause.fail(new Error(result.error ?? "Failed to move thread"))
      );
    }

    return AsyncResult.success(undefined);
  } catch (error) {
    return AsyncResult.failure(
      Cause.fail(error instanceof Error ? error : new Error(String(error)))
    );
  }
}
