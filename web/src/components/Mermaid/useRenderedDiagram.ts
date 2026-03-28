import { startTransition, useEffect, useId, useRef, useState } from "react";
import type { ThemeMode } from "@/hooks";

const LOADING_STATE = { status: "rendering" } as const;
const MERMAID_ID_PATTERN = /:/g;
const MERMAID_RENDER_ID_PREFIX = "mermaid";

let mermaidModulePromise: Promise<typeof import("mermaid")> | undefined;

const getMermaid = async () => {
  mermaidModulePromise ??= import("mermaid");
  const mermaidModule = await mermaidModulePromise;
  return mermaidModule.default;
};

const getErrorMessage = (error: unknown) => {
  return error instanceof Error ? error.message : "failed to render diagram";
};

type MermaidRenderState =
  | { status: "error"; message: string }
  | { status: "ready"; svg: string }
  | { status: "rendering" };

export const useRenderedDiagram = (code: string, themeMode: ThemeMode): MermaidRenderState => {
  const [renderState, setRenderState] = useState<MermaidRenderState>(LOADING_STATE);
  const renderCount = useRef(0);
  const renderKey = useId().replace(MERMAID_ID_PATTERN, "m");

  useEffect(() => {
    let cancelled = false;
    const nextRenderId = `${MERMAID_RENDER_ID_PREFIX}-${renderKey}-${(renderCount.current += 1)}`;

    startTransition(() => {
      setRenderState(LOADING_STATE);
    });

    const renderDiagram = async () => {
      try {
        const mermaid = await getMermaid();
        mermaid.initialize({
          startOnLoad: false,
          theme: themeMode === "dark" ? "dark" : "default",
          fontFamily: "inherit",
        });

        const { svg } = await mermaid.render(nextRenderId, code);
        if (cancelled) return;

        startTransition(() => {
          setRenderState({ status: "ready", svg });
        });
      } catch (error) {
        if (cancelled) return;

        startTransition(() => {
          setRenderState({
            status: "error",
            message: getErrorMessage(error),
          });
        });
      }
    };

    void renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [code, renderKey, themeMode]);

  return renderState;
};
