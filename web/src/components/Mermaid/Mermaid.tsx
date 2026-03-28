import { useState } from "react";
import { useThemeMode } from "@/hooks";
import { HtmlContent } from "@/components/HtmlContent";
import { DiagramModal } from "./components/DiagramModal/DiagramModal";
import { useRenderedDiagram } from "./useRenderedDiagram";

interface MermaidProps {
  code: string;
}

export const Mermaid = ({ code }: MermaidProps) => {
  const themeMode = useThemeMode();
  const renderState = useRenderedDiagram(code, themeMode);
  const [isModalOpen, setIsModalOpen] = useState(false);

  if (renderState.status === "error") {
    return (
      <div className="p-4 my-4 text-sm rounded-xl border border-fd-border bg-fd-card text-fd-muted-foreground">
        <p className="font-medium text-fd-foreground">Mermaid error</p>
        <pre className="mt-2 whitespace-pre-wrap">{renderState.message}</pre>
      </div>
    );
  }

  if (renderState.status === "rendering") {
    return (
      <div className="flex justify-center items-center p-8 my-4 text-sm rounded-xl border border-fd-border bg-fd-card text-fd-muted-foreground">
        Rendering diagram…
      </div>
    );
  }

  return (
    <>
      <div className="group relative my-4 overflow-x-auto rounded-xl border border-fd-border bg-fd-card p-4 [&_svg]:mx-auto [&_svg]:max-w-full">
        <button
          aria-label="Expand diagram"
          className="absolute top-2 right-2 z-10 p-1.5 rounded-lg shadow-sm opacity-0 transition-opacity group-hover:opacity-100 focus-visible:ring-2 focus-visible:opacity-100 focus-visible:outline-none bg-fd-background/80 text-fd-muted-foreground hover:bg-fd-accent hover:text-fd-accent-foreground focus-visible:ring-fd-ring"
          type="button"
          onClick={() => setIsModalOpen(true)}
        >
          <svg
            aria-hidden="true"
            fill="none"
            height="14"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            width="14"
          >
            <polyline points="15 3 21 3 21 9" />
            <polyline points="9 21 3 21 3 15" />
            <line x1="21" x2="14" y1="3" y2="10" />
            <line x1="3" x2="10" y1="21" y2="14" />
          </svg>
        </button>
        <HtmlContent html={renderState.svg} withInternalLinkNavigation={false} />
      </div>
      {isModalOpen ?
        <DiagramModal svg={renderState.svg} onClose={() => setIsModalOpen(false)} />
      : null}
    </>
  );
};
