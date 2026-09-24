import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { useThemeMode } from "@/hooks";
import { HtmlContent } from "@/components/HtmlContent";
import { DiagramModal } from "./components/DiagramModal/DiagramModal";
import { useDiagramHighlight } from "./useDiagramHighlight";
import { useRenderedDiagram } from "./useRenderedDiagram";

const DIAGRAM_FRAME_CLASS_NAME =
  "my-4 overflow-x-auto rounded-xl border border-fd-border bg-fd-card p-4 [&_svg]:mx-auto [&_svg]:max-w-full print:overflow-visible print:break-inside-avoid";
const RENDERING_MESSAGE = "Rendering diagram…";

interface MermaidProps {
  code: string;
}

const copyText = async (value: string) => {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();

  try {
    if (!document.execCommand("copy")) throw new Error("copy command failed");
  } finally {
    textarea.remove();
  }
};

export const Mermaid = ({ code }: MermaidProps) => {
  const themeMode = useThemeMode();
  const renderState = useRenderedDiagram(code, themeMode);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [copyState, setCopyState] = useState<"copied" | "error" | "idle">("idle");
  const containerRef = useRef<HTMLDivElement>(null);
  const activeSvg = renderState.status === "ready" ? (renderState.svgByTheme[themeMode] ?? null) : null;

  useDiagramHighlight(containerRef, activeSvg);

  useEffect(() => {
    if (copyState === "idle") return;

    const timeoutId = window.setTimeout(() => {
      setCopyState("idle");
    }, 1500);

    return () => window.clearTimeout(timeoutId);
  }, [copyState]);

  let copyLabel = "Copy Mermaid source";
  if (copyState === "copied") copyLabel = "Copied Mermaid source";
  if (copyState === "error") copyLabel = "Copy failed";

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
      <div
        aria-busy="true"
        className="flex justify-center items-center p-8 my-4 text-sm rounded-xl border border-fd-border bg-fd-card text-fd-muted-foreground"
      >
        {RENDERING_MESSAGE}
      </div>
    );
  }

  const { svgByTheme } = renderState;
  const needsPrintCopy = themeMode === "dark";
  const shouldShowModal = isModalOpen && activeSvg !== null;

  return (
    <>
      <div
        ref={containerRef}
        className={`group relative ${DIAGRAM_FRAME_CLASS_NAME} ${needsPrintCopy ? "print:hidden" : ""}`}
      >
        {activeSvg && (
          <div className="absolute top-2 right-2 z-10 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 print:hidden">
            <button
              aria-label={copyLabel}
              className="rounded-lg bg-fd-background/80 p-1.5 text-fd-muted-foreground shadow-sm transition hover:bg-fd-accent hover:text-fd-accent-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-fd-ring focus-visible:outline-none"
              title={copyLabel}
              type="button"
              onClick={async () => {
                try {
                  await copyText(code);
                  setCopyState("copied");
                } catch {
                  setCopyState("error");
                }
              }}
            >
              {copyState === "copied" ?
                <Check aria-hidden="true" className="size-3.5" />
              : <Copy aria-hidden="true" className="size-3.5" />}
            </button>
            <button
              aria-label="Expand diagram"
              className="rounded-lg bg-fd-background/80 p-1.5 text-fd-muted-foreground shadow-sm transition hover:bg-fd-accent hover:text-fd-accent-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-fd-ring focus-visible:outline-none"
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
          </div>
        )}
        {activeSvg ?
          <HtmlContent html={activeSvg} withInternalLinkNavigation={false} />
        : <div aria-busy="true">{RENDERING_MESSAGE}</div>}
      </div>
      {needsPrintCopy && (
        <div
          aria-busy={svgByTheme.light === undefined}
          aria-hidden="true"
          className={`hidden print:block ${DIAGRAM_FRAME_CLASS_NAME}`}
        >
          {svgByTheme.light ?
            <HtmlContent html={svgByTheme.light} withInternalLinkNavigation={false} />
          : RENDERING_MESSAGE}
        </div>
      )}
      {shouldShowModal ?
        <DiagramModal svg={activeSvg} onClose={() => setIsModalOpen(false)} />
      : null}
    </>
  );
};
