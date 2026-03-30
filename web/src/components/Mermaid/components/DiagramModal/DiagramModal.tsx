import { type MouseEvent, useRef, useState } from "react";
import { HtmlContent } from "@/components/HtmlContent";
import { useDiagramHighlight } from "../../useDiagramHighlight";
import { useDiagramViewport } from "./useDiagramViewport";

interface DiagramModalProps {
  onClose: () => void;
  svg: string;
}

const MODAL_BUTTON_CLASS_NAME =
  "rounded-lg bg-fd-background/90 px-3 py-1.5 text-xs font-medium text-fd-foreground shadow-lg transition hover:bg-fd-accent focus-visible:ring-2 focus-visible:ring-fd-ring focus-visible:outline-none";

export const DiagramModal = ({ onClose, svg }: DiagramModalProps) => {
  const { handleMouseDown, handleWheel, resetView, style } = useDiagramViewport(onClose);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isHighlightEnabled, setIsHighlightEnabled] = useState(true);

  useDiagramHighlight(containerRef, svg, isHighlightEnabled);

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  return (
    <div
      aria-label="Expanded Mermaid diagram"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      onClick={handleBackdropClick}
    >
      <div className="absolute top-4 right-4 z-[60] flex gap-2">
        <button
          aria-pressed={isHighlightEnabled}
          className={MODAL_BUTTON_CLASS_NAME}
          type="button"
          onClick={() => setIsHighlightEnabled((value) => !value)}
        >
          {isHighlightEnabled ? "Disable highlight" : "Enable highlight"}
        </button>
        <button className={MODAL_BUTTON_CLASS_NAME} type="button" onClick={resetView}>
          Reset
        </button>
        <button
          aria-label="Close expanded diagram"
          className={MODAL_BUTTON_CLASS_NAME}
          type="button"
          onClick={onClose}
        >
          Esc
        </button>
      </div>
      <div
        ref={containerRef}
        className="h-full w-full cursor-grab select-none overflow-hidden active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onWheel={handleWheel}
      >
        <HtmlContent
          className="flex h-full w-full items-center justify-center [&_svg]:max-h-none [&_svg]:max-w-none"
          html={svg}
          style={style}
          withInternalLinkNavigation={false}
        />
      </div>
    </div>
  );
};
