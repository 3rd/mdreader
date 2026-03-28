import { startTransition, useEffect, useEffectEvent, useRef, useState } from "react";
import { DynamicCodeBlock } from "fumadocs-ui/components/dynamic-codeblock";
import { EllipsisVertical, FileCode2, FileJson, FileText, Printer } from "lucide-react";
import { useRevalidator } from "react-router";
import { HtmlContent } from "@/components/HtmlContent";
import { Mermaid } from "@/components/Mermaid";
import type { ContentSegment, RuntimeConfig } from "../../../src/types";
import { API_EVENTS_PATH, API_SITE_EXPORT_JSON_PATH } from "../../../src/constants";
import { pageExportPath } from "../../../src/utils";
import { invalidateTreePayload } from "./docs-data";

const ACTION_MENU_TRIGGER_CLASS_NAME =
  "inline-flex size-9 items-center justify-center rounded-full border border-transparent text-fd-muted-foreground transition hover:border-fd-border hover:bg-fd-secondary/50 hover:text-fd-foreground focus-visible:border-fd-border focus-visible:bg-fd-secondary/50 focus-visible:text-fd-foreground focus-visible:ring-2 focus-visible:ring-fd-ring focus-visible:outline-none";
const ACTION_MENU_TRIGGER_OPEN_CLASS_NAME =
  "border-fd-border bg-fd-secondary/60 text-fd-foreground shadow-sm";
const ACTION_MENU_PANEL_CLASS_NAME =
  "absolute right-0 z-20 mt-2 flex min-w-56 flex-col overflow-hidden rounded-xl border border-fd-border bg-fd-background shadow-lg";
const ACTION_MENU_ITEM_CLASS_NAME =
  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-fd-foreground transition hover:bg-fd-accent hover:text-fd-accent-foreground focus-visible:bg-fd-accent focus-visible:text-fd-accent-foreground focus-visible:outline-none";
const ACTION_MENU_ICON_CLASS_NAME = "size-4 shrink-0 text-fd-muted-foreground";

const getSegmentBaseKey = (segment: ContentSegment) => {
  if (segment.type === "html") return `html:${segment.content.slice(0, 80)}`;
  if (segment.lang === "mermaid") return `mermaid:${segment.code.slice(0, 80)}`;
  return `code:${segment.lang}:${segment.code.slice(0, 80)}`;
};

const getRuntimeMode = (): RuntimeConfig["mode"] | undefined => {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { __MDREADER_RUNTIME__?: RuntimeConfig }).__MDREADER_RUNTIME__?.mode;
};

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

export const BREADCRUMB_DISABLED = { enabled: false } as const;

export const PageContent = ({ segments }: { segments: ContentSegment[] }) => {
  const segmentKeyCounts = new Map<string, number>();

  return (
    <>
      {segments.map((segment) => {
        const baseKey = getSegmentBaseKey(segment);
        const count = (segmentKeyCounts.get(baseKey) ?? 0) + 1;
        const key = count === 1 ? baseKey : `${baseKey}:${count}`;
        segmentKeyCounts.set(baseKey, count);

        if (segment.type === "html") return <HtmlContent key={key} html={segment.content} />;

        if (segment.lang === "mermaid") {
          return (
            <div key={key} className="not-prose">
              <Mermaid code={segment.code} />
            </div>
          );
        }

        return (
          <div key={key} className="my-4 not-prose">
            <DynamicCodeBlock code={segment.code} lang={segment.lang} />
          </div>
        );
      })}
    </>
  );
};

export const useLiveReload = () => {
  const { revalidate } = useRevalidator();
  const handleMessage = useEffectEvent((event: MessageEvent<string>) => {
    if (event.data !== "reload") return;

    invalidateTreePayload();
    startTransition(() => {
      revalidate();
    });
  });

  useEffect(() => {
    if (getRuntimeMode() !== "serve") return;

    const eventSource = new EventSource(API_EVENTS_PATH);
    eventSource.addEventListener("message", handleMessage);

    return () => eventSource.close();
  }, [handleMessage]);
};

export const PageActions = ({ pagePath }: { pagePath: string }) => {
  const [copyState, setCopyState] = useState<"copied" | "error" | "idle">("idle");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const markdownExportPath = pageExportPath(pagePath, "markdown");
  const exportLinks = [
    { href: pageExportPath(pagePath, "html"), icon: FileCode2, label: "Export HTML" },
    { href: pageExportPath(pagePath, "json"), icon: FileJson, label: "Export JSON" },
    { href: API_SITE_EXPORT_JSON_PATH, icon: FileJson, label: "Export Site JSON" },
  ] as const;

  useEffect(() => {
    if (copyState === "idle") return;

    const timeoutId = window.setTimeout(() => {
      setCopyState("idle");
    }, 1500);

    return () => window.clearTimeout(timeoutId);
  }, [copyState]);

  const closeMenu = () => {
    setIsMenuOpen(false);
  };

  const handleDocumentPointerDown = useEffectEvent((event: PointerEvent) => {
    const target = event.target;
    if (!(target instanceof Node) || menuRef.current?.contains(target)) return;

    setIsMenuOpen(false);
  });

  const handleDocumentKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === "Escape") setIsMenuOpen(false);
  });

  useEffect(() => {
    if (!isMenuOpen) return;

    document.addEventListener("pointerdown", handleDocumentPointerDown);
    document.addEventListener("keydown", handleDocumentKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handleDocumentPointerDown);
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [handleDocumentKeyDown, handleDocumentPointerDown, isMenuOpen]);

  const handleCopyMarkdown = async () => {
    try {
      const response = await fetch(markdownExportPath);
      if (!response.ok) throw new Error(`failed to fetch markdown: ${response.status}`);

      await copyText(await response.text());
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }

    closeMenu();
  };

  return (
    <div className="not-prose md:ml-auto">
      <div ref={menuRef} className="relative">
        <button
          aria-label="Page actions"
          aria-expanded={isMenuOpen}
          className={`${ACTION_MENU_TRIGGER_CLASS_NAME} ${isMenuOpen ? ACTION_MENU_TRIGGER_OPEN_CLASS_NAME : ""}`}
          title="Page actions"
          type="button"
          onClick={() => setIsMenuOpen((open) => !open)}
        >
          <EllipsisVertical aria-hidden="true" className="size-4 shrink-0" />
        </button>
        {isMenuOpen ?
          <div className={ACTION_MENU_PANEL_CLASS_NAME}>
            <button
              className={ACTION_MENU_ITEM_CLASS_NAME}
              type="button"
              onClick={() => {
                closeMenu();
                window.print();
              }}
            >
              <Printer aria-hidden="true" className={ACTION_MENU_ICON_CLASS_NAME} />
              Print
            </button>
            <button className={ACTION_MENU_ITEM_CLASS_NAME} type="button" onClick={handleCopyMarkdown}>
              <FileText aria-hidden="true" className={ACTION_MENU_ICON_CLASS_NAME} />
              {copyState === "copied" ? "Copied Markdown" : "Copy Markdown"}
            </button>
            <a className={ACTION_MENU_ITEM_CLASS_NAME} href={markdownExportPath} onClick={closeMenu}>
              <FileText aria-hidden="true" className={ACTION_MENU_ICON_CLASS_NAME} />
              Export Markdown
            </a>
            {exportLinks.map(({ href, icon: Icon, label }) => (
              <a key={label} className={ACTION_MENU_ITEM_CLASS_NAME} href={href} onClick={closeMenu}>
                <Icon aria-hidden="true" className={ACTION_MENU_ICON_CLASS_NAME} />
                {label}
              </a>
            ))}
          </div>
        : null}
      </div>
      {copyState === "error" ?
        <p className="mt-2 text-xs text-fd-muted-foreground md:text-right">Unable to copy Markdown.</p>
      : null}
    </div>
  );
};

export const RouteErrorState = ({ message }: { message: string }) => {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-3xl font-semibold text-fd-foreground">Unable to load this page</h1>
      <p className="max-w-xl text-sm text-fd-muted-foreground">{message}</p>
    </div>
  );
};
