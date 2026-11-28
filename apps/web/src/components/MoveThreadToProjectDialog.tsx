import { ProjectId, type ScopedThreadRef } from "@t3tools/contracts";
import { msg, T, useGT } from "gt-react";
import { FolderIcon } from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { ProjectFavicon } from "./ProjectFavicon";
import { useProjects } from "../state/entities";
import { readThreadShell } from "../state/entities";

export interface MoveThreadToProjectDialogProps {
  readonly open: boolean;
  readonly threadRef: ScopedThreadRef;
  readonly onConfirm: (targetProjectId: ProjectId) => void | Promise<void>;
  readonly onCancel: () => void;
}

export function MoveThreadToProjectDialog(props: MoveThreadToProjectDialogProps) {
  const { open, threadRef, onConfirm, onCancel } = props;
  const gt = useGT();
  const thread = readThreadShell(threadRef);
  const projects = useProjects(threadRef.environmentId);
  
  // Filter out the current project
  const availableProjects = projects.filter(
    (project) => project.id !== thread?.projectId
  );

  const [selectedProjectId, setSelectedProjectId] = useState<ProjectId | null>(
    availableProjects[0]?.id ?? null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (!selectedProjectId) return;
    setIsSubmitting(true);
    try {
      await onConfirm(selectedProjectId);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <T>Move thread to project</T>
          </AlertDialogTitle>
          <AlertDialogDescription>
            <T>Select the project where you want to move this thread.</T>
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <div className="flex flex-col gap-2 py-4">
          {availableProjects.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              <T>No other projects available</T>
            </div>
          ) : (
            availableProjects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => setSelectedProjectId(project.id)}
                className={`flex items-center gap-3 rounded-md border px-4 py-3 text-left transition-colors hover:bg-accent ${
                  selectedProjectId === project.id
                    ? "border-primary bg-accent"
                    : "border-border"
                }`}
              >
                {project.projectIcon || project.faviconPath ? (
                  <ProjectFavicon project={project} className="size-5 shrink-0" />
                ) : (
                  <FolderIcon className="size-5 shrink-0 text-muted-foreground" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{project.title}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {project.workspaceRoot}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel} disabled={isSubmitting}>
            {gt("Cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={!selectedProjectId || isSubmitting}
          >
            {isSubmitting ? gt("Moving…") : gt("Move")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
