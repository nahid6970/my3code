import type { ProjectId, ScopedThreadRef } from "@t3tools/contracts";
import { T, useGT } from "gt-react";
import { FolderIcon, SearchIcon } from "lucide-react";
import { useEffect, useState, type KeyboardEvent } from "react";
import { create } from "zustand";
import {
  Dialog,
  DialogPanel,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ProjectFavicon } from "./ProjectFavicon";
import { useProjects, readThreadShell } from "../state/entities";

type MoveChoice = { readonly targetProjectId: ProjectId };
type Request = {
  readonly threadRef: ScopedThreadRef;
  readonly resolve: (choice: MoveChoice | null) => void;
};
const useRequest = create<{ request: Request | null }>(() => ({ request: null }));

export function requestMoveThreadToProject(threadRef: ScopedThreadRef): Promise<MoveChoice | null> {
  useRequest.getState().request?.resolve(null);
  return new Promise((resolve) => useRequest.setState({ request: { threadRef, resolve } }));
}

function finish(choice: MoveChoice | null) {
  const request = useRequest.getState().request;
  useRequest.setState({ request: null });
  request?.resolve(choice);
}

export function MoveThreadToProjectDialogHost() {
  const request = useRequest((state) => state.request);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- resolves any pending move request promise with null when the dialog host unmounts
  useEffect(() => () => finish(null), []);
  return request ? <MoveThreadToProjectDialog threadRef={request.threadRef} /> : null;
}

function MoveThreadToProjectDialog(props: { readonly threadRef: ScopedThreadRef }) {
  const { threadRef } = props;
  const gt = useGT();
  const thread = readThreadShell(threadRef);
  const projects = useProjects(threadRef.environmentId);

  const availableProjects = projects.filter((project) => project.id !== thread?.projectId);
  const [query, setQuery] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<ProjectId | null>(null);
  const filteredProjects = availableProjects.filter((project) =>
    `${project.title} ${project.workspaceRoot}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const selectedProject =
    filteredProjects.find((project) => project.id === selectedProjectId)?.id ??
    filteredProjects[0]?.id ??
    null;
  const handleConfirm = () => {
    if (!selectedProject) return;
    finish({ targetProjectId: selectedProject });
  };
  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const currentIndex = filteredProjects.findIndex((project) => project.id === selectedProject);
    const delta = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex =
      currentIndex < 0
        ? 0
        : (currentIndex + delta + filteredProjects.length) % filteredProjects.length;
    const nextProject = filteredProjects[nextIndex];
    if (nextProject) setSelectedProjectId(nextProject.id);
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) finish(null);
      }}
    >
      <DialogPopup className="max-h-[min(52dvh,28rem)] sm:max-w-xl">
        <form
          className="flex min-h-0 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            handleConfirm();
          }}
        >
          <DialogHeader className="gap-3 px-4 pb-3 pt-4">
            <DialogTitle className="text-lg">
              <T>Move thread to project</T>
            </DialogTitle>
            <div className="flex items-center gap-2">
              <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
              <Input
                type="search"
                autoFocus
                aria-label={gt("Search projects")}
                placeholder={gt("Search...")}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleSearchKeyDown}
                className="border-0 bg-transparent shadow-none before:hidden focus-within:ring-0"
              />
            </div>
          </DialogHeader>
          <div className="min-h-0 flex-1">
            <DialogPanel className="space-y-1 px-2 py-1">
              <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
                <T>Projects</T>
              </div>
              <div className="flex flex-col gap-0.5">
                {filteredProjects.length === 0 ? (
                  <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                    {availableProjects.length === 0 ? (
                      <T>No other projects available</T>
                    ) : (
                      <T>No matching projects.</T>
                    )}
                  </div>
                ) : (
                  filteredProjects.map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => setSelectedProjectId(project.id)}
                      className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent ${
                        selectedProject === project.id ? "bg-accent" : ""
                      }`}
                    >
                      {project.projectIcon || project.faviconPath ? (
                        <ProjectFavicon project={project} className="size-4 shrink-0" />
                      ) : (
                        <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0 flex-1 leading-5">
                        <div className="truncate text-sm font-medium">{project.title}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {project.workspaceRoot}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </DialogPanel>
          </div>
          <DialogFooter className="px-4 py-3">
            <Button type="button" variant="outline" onClick={() => finish(null)}>
              <T>Cancel</T>
            </Button>
            <Button type="submit" disabled={!selectedProject}>
              <T>Move</T>
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
