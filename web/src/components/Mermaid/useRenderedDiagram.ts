import { startTransition, useEffect, useId, useRef, useState } from "react";
import type { ThemeMode } from "@/hooks";

const LOADING_STATE = { status: "rendering" } as const;
const MERMAID_ID_PATTERN = /:/g;
const MERMAID_RENDER_ID_PREFIX = "mermaid";
const MERMAID_THEME_BY_MODE = { dark: "dark", light: "default" } as const satisfies Record<ThemeMode, string>;

interface DiagramRenderRequest {
  code: string;
  isCancelled: () => boolean;
  renderId: string;
  themeMode: ThemeMode;
}

let mermaidModulePromise: Promise<typeof import("mermaid")> | undefined;
let mermaidRenderQueue: Promise<unknown> = Promise.resolve();

const getMermaid = async () => {
  mermaidModulePromise ??= import("mermaid");
  const mermaidModule = await mermaidModulePromise;
  return mermaidModule.default;
};

const getErrorMessage = (error: unknown) => {
  return error instanceof Error ? error.message : "failed to render diagram";
};

const renderThemedDiagram = ({ code, isCancelled, renderId, themeMode }: DiagramRenderRequest) => {
  const render = mermaidRenderQueue.then(async () => {
    if (isCancelled()) return null;

    const mermaid = await getMermaid();
    if (isCancelled()) return null;

    mermaid.initialize({
      startOnLoad: false,
      theme: MERMAID_THEME_BY_MODE[themeMode],
      fontFamily: "inherit",
    });

    const { svg } = await mermaid.render(renderId, code);
    return svg;
  });

  mermaidRenderQueue = render.catch(() => undefined);
  return render;
};

type MermaidRenderState =
  | { status: "error"; message: string }
  | { status: "ready"; svgByTheme: Partial<Record<ThemeMode, string>> }
  | { status: "rendering" };

export const useRenderedDiagram = (code: string, themeMode: ThemeMode): MermaidRenderState => {
  const [renderState, setRenderState] = useState<MermaidRenderState>(LOADING_STATE);
  const renderCount = useRef(0);
  const renderKey = useId().replace(MERMAID_ID_PATTERN, "m");
  const preferredThemeRef = useRef(themeMode);

  useEffect(() => {
    preferredThemeRef.current = themeMode;
  }, [themeMode]);

  useEffect(() => {
    let isCancelled = false;
    const nextRenderId = `${MERMAID_RENDER_ID_PREFIX}-${renderKey}-${(renderCount.current += 1)}`;
    const preferredTheme = preferredThemeRef.current;
    const otherTheme = preferredTheme === "light" ? "dark" : "light";

    startTransition(() => {
      setRenderState(LOADING_STATE);
    });

    const renderTheme = async (mode: ThemeMode) => {
      const svg = await renderThemedDiagram({
        code,
        isCancelled: () => isCancelled,
        renderId: `${nextRenderId}-${mode}`,
        themeMode: mode,
      });

      const shouldDiscardResult = isCancelled || svg === null;
      if (shouldDiscardResult) return;

      startTransition(() => {
        setRenderState((current) => {
          if (current.status === "error") return current;

          const svgByTheme = current.status === "ready" ? current.svgByTheme : {};
          return { status: "ready", svgByTheme: { ...svgByTheme, [mode]: svg } };
        });
      });
    };

    const renderDiagram = async () => {
      try {
        await Promise.all([renderTheme(preferredTheme), renderTheme(otherTheme)]);
      } catch (error) {
        if (isCancelled) return;

        startTransition(() => {
          setRenderState({
            status: "error",
            message: getErrorMessage(error),
          });
        });
      }
    };

    renderDiagram();

    return () => {
      isCancelled = true;
    };
  }, [code, renderKey]);

  return renderState;
};
