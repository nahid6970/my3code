import { resolveTimelineMinimapPreview, type TimelineMinimapItem } from "./timelineMinimapItems";
import { useRef, useState, type MouseEvent } from "react";
import { T, useGT } from "gt-react";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { Button } from "../ui/button";
import {
  resolveTimelineMinimapHeightStyle,
  resolveTimelineMinimapIndexFromPointer,
  resolveTimelineMinimapNavigationInteractive,
  resolveTimelineMinimapTopPercent,
  TIMELINE_MINIMAP_MIN_ITEMS,
} from "./MessagesTimeline.logic";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { cn } from "~/lib/utils";

export function TimelineMinimap({
  hasPersistentGutter,
  hitStrip: { left: hitStripLeft, width: hitStripWidth },
  currentIndex,
  atEnd,
  items,
  stripMap,
  onWheel,
  onSelect,
}: {
  hasPersistentGutter: boolean;
  hitStrip: { left: number; width: number };
  currentIndex: number | null;
  atEnd: boolean;
  items: ReadonlyArray<TimelineMinimapItem>;
  stripMap: Map<string, HTMLSpanElement>;
  onWheel: (event: WheelEvent) => void;
  onSelect: (item: TimelineMinimapItem) => void;
}) {
  const gt = useGT();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);
  const dotRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const wheelTargetRef = (node: HTMLDivElement | null) => {
    if (!node) return;
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  };

  const resolvedActiveIndex =
    activeIndex !== null && activeIndex < items.length ? activeIndex : null;
  const activeItem = resolveTimelineMinimapPreview(
    resolvedActiveIndex === null ? null : (items[resolvedActiveIndex] ?? null),
  );
  const navigationInteractive = resolveTimelineMinimapNavigationInteractive(hitStripWidth);
  const activeTopPercent =
    resolvedActiveIndex === null
      ? 0
      : resolveTimelineMinimapTopPercent(resolvedActiveIndex, items.length);
  const resolvedCurrentIndex =
    currentIndex !== null && currentIndex >= 0 && currentIndex < items.length ? currentIndex : null;
  const previousItem =
    resolvedCurrentIndex === null ? null : (items[resolvedCurrentIndex - 1] ?? null);
  const nextItem =
    resolvedCurrentIndex === null || atEnd ? null : (items[resolvedCurrentIndex + 1] ?? null);

  const resolveActiveIndexFromPointer = (event: MouseEvent<HTMLElement>) => {
    const rect = (railRef.current ?? event.currentTarget).getBoundingClientRect();
    return resolveTimelineMinimapIndexFromPointer({
      itemCount: items.length,
      railTop: rect.top,
      railHeight: rect.height,
      pointerY: event.clientY,
    });
  };

  const updateActiveIndexFromPointer = (event: MouseEvent<HTMLElement>) => {
    const nextIndex = resolveActiveIndexFromPointer(event);
    setActiveIndex(nextIndex);
  };

  if (items.length < TIMELINE_MINIMAP_MIN_ITEMS) {
    return null;
  }

  return (
    <div
      className={cn(
        "group/minimap pointer-events-none absolute bottom-0 left-0 top-[calc(-1*var(--chat-header-height,0px))] z-40 w-18",
        hasPersistentGutter
          ? "opacity-100"
          : "hidden opacity-0 transition-opacity duration-150 hover:opacity-100 focus-within:opacity-100 [@media(pointer:fine)]:block",
      )}
      data-testid="timeline-minimap"
      data-persistent-gutter={hasPersistentGutter ? "true" : "false"}
      ref={wheelTargetRef}
    >
      <div className="relative h-full w-full select-none">
        <div
          className={cn(
            "absolute top-1/2 -translate-y-1/2",
            hitStripWidth > 0 ? "pointer-events-auto" : "pointer-events-none",
          )}
          onMouseLeave={() => setActiveIndex(null)}
          onMouseMove={updateActiveIndexFromPointer}
          style={{
            height: resolveTimelineMinimapHeightStyle(items.length),
            left: hitStripLeft,
            width: hitStripWidth,
          }}
          ref={railRef}
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-foreground/70"
          />
          <TimelineMinimapNavigationButton
            direction="previous"
            disabled={previousItem === null}
            interactive={navigationInteractive}
            onClick={() => {
              if (previousItem) onSelect(previousItem);
            }}
          />
          {items.map((item, index) => {
            const top = `${resolveTimelineMinimapTopPercent(index, items.length)}%`;
            const activeDistance =
              resolvedActiveIndex === null ? null : Math.abs(index - resolvedActiveIndex);
            const messageText = item.userText?.slice(0, 120).trim().replace(/\s+/gu, " ");
            const accessibleText =
              messageText && messageText.length > 0 ? messageText : gt("User message");
            const isCurrent = index === resolvedCurrentIndex;
            const dotTabIndex = resolvedCurrentIndex === null ? index === 0 : isCurrent;

            return (
              <button
                aria-current={isCurrent ? "true" : undefined}
                aria-label={gt("Jump to message: {text}", { text: accessibleText })}
                className="absolute left-1/2 flex size-6 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/80"
                data-testid="timeline-minimap-dot"
                key={item.id}
                onBlur={() => setActiveIndex(null)}
                onClick={(event) => {
                  // At high turn counts the 24px hit targets overlap. Resolve pointer clicks
                  // against the rail itself so the nearest visible dot always wins.
                  const selectedIndex =
                    event.detail === 0 ? index : resolveActiveIndexFromPointer(event);
                  const selectedItem = items[selectedIndex ?? index] ?? item;
                  setActiveIndex(selectedIndex ?? index);
                  onSelect(selectedItem);
                }}
                onFocus={() => setActiveIndex(index)}
                onKeyDown={(event) => {
                  let nextIndex: number | null = null;
                  if (event.key === "ArrowDown") nextIndex = index + 1;
                  else if (event.key === "ArrowUp") nextIndex = index - 1;
                  else if (event.key === "Home") nextIndex = 0;
                  else if (event.key === "End") nextIndex = items.length - 1;
                  if (nextIndex !== null) {
                    event.preventDefault();
                    dotRefs.current[Math.max(0, Math.min(items.length - 1, nextIndex))]?.focus();
                  }
                }}
                onMouseEnter={() => setActiveIndex(index)}
                ref={(node) => {
                  dotRefs.current[index] = node;
                }}
                style={{ top }}
                tabIndex={dotTabIndex ? 0 : -1}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "pointer-events-none size-2 rounded-full border border-background/90 bg-foreground/65 transition-[background-color,transform] duration-150 data-[in-view=true]:bg-info-foreground",
                    activeDistance === 0 ? "scale-150" : activeDistance === 1 && "scale-125",
                  )}
                  data-in-view="false"
                  data-minimap-strip
                  style={{
                    backgroundColor:
                      isCurrent || activeDistance === 0
                        ? "var(--color-info-foreground)"
                        : undefined,
                  }}
                  ref={(node) => {
                    if (node) {
                      stripMap.set(item.id, node);
                    } else {
                      stripMap.delete(item.id);
                    }
                  }}
                />
              </button>
            );
          })}
          {activeItem ? (
            // Display-only: it overlaps the message column, and the dot rail tracks beneath it.
            <span
              className="pointer-events-none absolute left-8 w-80 -translate-y-1/2"
              style={{ top: `${activeTopPercent}%` }}
            >
              <span className="dropdown-glass block rounded-xl p-3 text-left text-popover-foreground shadow-xl shadow-black/25">
                <span className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium leading-5">
                  {activeItem.userText ?? <T>User message</T>}
                </span>
                {activeItem.assistantText ? (
                  <span
                    className="mt-1 max-h-[3.75rem] overflow-hidden text-muted-foreground text-sm leading-5"
                    style={{
                      display: "-webkit-box",
                      WebkitBoxOrient: "vertical",
                      WebkitLineClamp: 3,
                    }}
                  >
                    {activeItem.assistantText}
                  </span>
                ) : null}
              </span>
            </span>
          ) : null}
          <TimelineMinimapNavigationButton
            direction="next"
            disabled={nextItem === null}
            interactive={navigationInteractive}
            onClick={() => {
              if (nextItem) onSelect(nextItem);
            }}
          />
        </div>
      </div>
    </div>
  );
}

function TimelineMinimapNavigationButton({
  direction,
  disabled,
  interactive,
  onClick,
}: {
  direction: "previous" | "next";
  disabled: boolean;
  interactive: boolean;
  onClick: () => void;
}) {
  const gt = useGT();
  const previous = direction === "previous";
  const label = previous ? gt("Previous turn") : gt("Next turn");
  const Icon = previous ? ChevronUpIcon : ChevronDownIcon;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn(
              "absolute left-1/2 z-10 inline-flex -translate-x-1/2 opacity-0 transition-opacity duration-150 hover:opacity-100 focus-within:opacity-100",
              interactive ? "pointer-events-auto" : "pointer-events-none",
              previous ? "bottom-[calc(100%+6px)]" : "top-[calc(100%+6px)]",
            )}
          />
        }
      >
        <Button
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
          size="icon-micro"
          type="button"
          variant="ghost-muted"
        >
          <Icon className="size-4 text-foreground/90" />
        </Button>
      </TooltipTrigger>
      <TooltipPopup side={previous ? "top" : "bottom"}>{label}</TooltipPopup>
    </Tooltip>
  );
}
