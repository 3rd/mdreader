/* eslint-disable react/no-danger */

import { type CSSProperties, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { SERVABLE_EXTENSIONS } from "../../../../src/constants";
import { decodeSlugPath, pagePreviewPath } from "../../../../src/utils";

const LINK_PREVIEW_DELAY_MS = 180;
const LINK_PREVIEW_GAP_PX = 10;
const LINK_PREVIEW_MARGIN_PX = 16;
const NON_DOC_ROUTE_EXTENSIONS = new Set([".css", ".js", ".map", ".woff", ".woff2", ...SERVABLE_EXTENSIONS]);
const previewCache = new Map<string, Promise<LinkPreviewPayload | null>>();

interface LinkPreviewPayload {
  description: string;
  excerpt: string;
  title: string;
  url: string;
}

interface InternalLinkTarget {
  href: string;
  slugPath: string;
}

interface PreviewState {
  href: string;
  payload: LinkPreviewPayload | null;
  status: "loading" | "ready";
}

interface HtmlContentProps {
  className?: string;
  html: string;
  style?: CSSProperties;
  withInternalLinkNavigation?: boolean;
}

const getPathExtension = (pathname: string) => {
  const lastSegment = pathname.split("/").at(-1) ?? "";
  const lastDotIndex = lastSegment.lastIndexOf(".");
  if (lastDotIndex <= 0) return "";
  return lastSegment.slice(lastDotIndex).toLowerCase();
};

const parseLinkPreviewPayload = (value: unknown): LinkPreviewPayload | null => {
  if (typeof value !== "object" || value === null) return null;

  const record = value as Record<string, unknown>;
  if (
    typeof record.title !== "string" ||
    typeof record.description !== "string" ||
    typeof record.excerpt !== "string" ||
    typeof record.url !== "string"
  ) {
    return null;
  }

  return {
    description: record.description,
    excerpt: record.excerpt,
    title: record.title,
    url: record.url,
  };
};

const fetchLinkPreview = (slugPath: string) => {
  const cached = previewCache.get(slugPath);
  if (cached) return cached;

  const request = fetch(pagePreviewPath(slugPath))
    .then(async (response) => {
      if (!response.ok) return null;
      return parseLinkPreviewPayload(await response.json());
    })
    .catch(() => null);

  previewCache.set(slugPath, request);
  return request;
};

const toSlugPath = (pathname: string) => {
  const normalizedPath = pathname.replace(/^\/+|\/+$/g, "");
  if (!normalizedPath) return "";
  return decodeSlugPath(normalizedPath);
};

const getInternalLinkTarget = (anchor: HTMLAnchorElement): InternalLinkTarget | null => {
  const rawHref = anchor.getAttribute("href");
  if (!rawHref || rawHref.startsWith("#")) return null;
  if (anchor.target && anchor.target !== "_self") return null;
  if (anchor.hasAttribute("download")) return null;

  const destination = new URL(anchor.href, window.location.href);
  if (destination.origin !== window.location.origin) return null;
  if (destination.pathname.startsWith("/api/")) return null;
  if (NON_DOC_ROUTE_EXTENSIONS.has(getPathExtension(destination.pathname))) return null;

  const slugPath = toSlugPath(destination.pathname);
  if (slugPath === null) return null;

  return {
    href: `${destination.pathname}${destination.search}${destination.hash}`,
    slugPath,
  };
};

export const invalidateLinkPreviewCache = () => {
  previewCache.clear();
};

const getAnchorFromTarget = (target: EventTarget | null) => {
  if (!(target instanceof Node)) return null;

  const element = target instanceof Element ? target : target.parentElement;
  if (!element) return null;

  const anchor = element.closest("a");
  return anchor instanceof HTMLAnchorElement ? anchor : null;
};

export const HtmlContent = ({
  className,
  html,
  style,
  withInternalLinkNavigation = true,
}: HtmlContentProps) => {
  const navigate = useNavigate();
  const contentRef = useRef<HTMLDivElement>(null);
  const [previewState, setPreviewState] = useState<PreviewState | null>(null);
  const [previewStyle, setPreviewStyle] = useState<CSSProperties>({});
  const previewDelayRef = useRef<number | null>(null);
  const previewAnchorRef = useRef<HTMLAnchorElement | null>(null);
  const previewPositionRef = useRef<() => void>(() => {});
  const previewTargetHrefRef = useRef<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const markup = useMemo(
    () => {
      return (
        <div ref={contentRef} dangerouslySetInnerHTML={{ __html: html }} className={className} style={style} />
      )
    },
    [className, html, style],
  );

  const clearPreviewDelay = () => {
    if (previewDelayRef.current === null) return;
    window.clearTimeout(previewDelayRef.current);
    previewDelayRef.current = null;
  };

  const getPreviewAnchor = () => {
    const root = contentRef.current;
    const anchor = previewAnchorRef.current;
    if (!root || !anchor || !root.contains(anchor)) return null;
    return anchor;
  };

  const hidePreview = useEffectEvent(() => {
    clearPreviewDelay();
    previewAnchorRef.current = null;
    previewTargetHrefRef.current = null;
    setPreviewState(null);
    setPreviewStyle({});
  });

  const showPreview = useEffectEvent((anchor: HTMLAnchorElement) => {
    if (!withInternalLinkNavigation) return;

    const target = getInternalLinkTarget(anchor);
    if (!target) {
      hidePreview();
      return;
    }
    previewAnchorRef.current = anchor;
    if (previewTargetHrefRef.current === target.href) {
      window.requestAnimationFrame(() => {
        previewPositionRef.current();
      });
      return;
    }

    clearPreviewDelay();
    previewTargetHrefRef.current = target.href;
    previewDelayRef.current = window.setTimeout(async () => {
      setPreviewState({
        href: target.href,
        payload: null,
        status: "loading",
      });

      const payload = await fetchLinkPreview(target.slugPath);
      if (payload) setPreviewStyle({ visibility: "hidden" });
      setPreviewState((current) => {
        if (!current || current.href !== target.href) return current;
        if (!payload) {
          previewTargetHrefRef.current = null;
          return null;
        }

        return {
          href: target.href,
          payload,
          status: "ready",
        };
      });
    }, LINK_PREVIEW_DELAY_MS);
  });

  const handleDocumentKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === "Escape") hidePreview();
  });

  const updatePreviewPosition = useEffectEvent(() => {
    if (!previewState || !previewRef.current) return;
    const anchor = getPreviewAnchor();
    if (!anchor) {
      hidePreview();
      return;
    }

    const anchorRect = anchor.getBoundingClientRect();
    const previewRect = previewRef.current.getBoundingClientRect();
    const previewHeight = Math.max(previewRect.height, previewRef.current.scrollHeight);
    const maxLeft = Math.max(
      LINK_PREVIEW_MARGIN_PX,
      window.innerWidth - previewRect.width - LINK_PREVIEW_MARGIN_PX,
    );
    const availableAbove = Math.max(96, anchorRect.top - LINK_PREVIEW_MARGIN_PX - LINK_PREVIEW_GAP_PX);
    const availableBelow = Math.max(
      96,
      window.innerHeight - anchorRect.bottom - LINK_PREVIEW_MARGIN_PX - LINK_PREVIEW_GAP_PX,
    );
    const placeBelow = availableBelow >= previewHeight || availableBelow >= availableAbove;
    const constrainedHeight = Math.min(previewHeight, placeBelow ? availableBelow : availableAbove);
    const left = Math.min(Math.max(LINK_PREVIEW_MARGIN_PX, anchorRect.left), maxLeft);
    const top =
      placeBelow ?
        anchorRect.bottom + LINK_PREVIEW_GAP_PX
      : Math.max(LINK_PREVIEW_MARGIN_PX, anchorRect.top - LINK_PREVIEW_GAP_PX - constrainedHeight);

    setPreviewStyle({
      left,
      maxHeight: constrainedHeight,
      top,
      visibility: "visible",
    });
  });
  previewPositionRef.current = updatePreviewPosition;

  const isPointInsideRect = (rect: DOMRect, x: number, y: number) =>
    x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;

  useEffect(() => {
    if (!withInternalLinkNavigation) return;

    const root = contentRef.current;
    if (!root) return;

    const getPreviewableAnchor = (target: EventTarget | null) => {
      const anchor = getAnchorFromTarget(target);
      if (!anchor || !root.contains(anchor)) return null;
      if (!getInternalLinkTarget(anchor)) return null;
      return anchor;
    };

    const openPreviewFromTarget = (target: EventTarget | null) => {
      const anchor = getPreviewableAnchor(target);
      if (!anchor) return;

      showPreview(anchor);
    };

    const closePreviewFromTarget = (target: EventTarget | null, relatedTarget: EventTarget | null) => {
      const anchor = getPreviewableAnchor(target);
      if (!anchor) return;
      if (relatedTarget instanceof Node && anchor.contains(relatedTarget)) return;
      if (relatedTarget instanceof Node && previewRef.current?.contains(relatedTarget)) return;

      hidePreview();
    };

    const handleMouseOver = (event: globalThis.MouseEvent) => {
      openPreviewFromTarget(event.target);
    };

    const handleMouseOut = (event: globalThis.MouseEvent) => {
      closePreviewFromTarget(event.target, event.relatedTarget);
    };

    const handleFocusIn = (event: globalThis.FocusEvent) => {
      openPreviewFromTarget(event.target);
    };

    const handleFocusOut = (event: globalThis.FocusEvent) => {
      closePreviewFromTarget(event.target, event.relatedTarget);
    };

    const handleClick = (event: globalThis.MouseEvent) => {
      if (!withInternalLinkNavigation) return;
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = getPreviewableAnchor(event.target);
      if (!anchor) return;

      const nextTarget = getInternalLinkTarget(anchor);
      if (!nextTarget) return;

      event.preventDefault();
      hidePreview();
      navigate(nextTarget.href);
    };

    root.addEventListener("mouseover", handleMouseOver);
    root.addEventListener("mouseout", handleMouseOut);
    root.addEventListener("focusin", handleFocusIn);
    root.addEventListener("focusout", handleFocusOut);
    root.addEventListener("click", handleClick);

    return () => {
      root.removeEventListener("mouseover", handleMouseOver);
      root.removeEventListener("mouseout", handleMouseOut);
      root.removeEventListener("focusin", handleFocusIn);
      root.removeEventListener("focusout", handleFocusOut);
      root.removeEventListener("click", handleClick);
    };
  }, [hidePreview, html, navigate, showPreview, withInternalLinkNavigation]);

  useEffect(() => {
    document.addEventListener("keydown", handleDocumentKeyDown);

    return () => {
      document.removeEventListener("keydown", handleDocumentKeyDown);
      clearPreviewDelay();
    };
  }, [handleDocumentKeyDown]);

  useEffect(() => {
    if (!previewState || previewState.status !== "ready") return;

    updatePreviewPosition();
    window.addEventListener("resize", updatePreviewPosition);
    window.addEventListener("scroll", updatePreviewPosition, true);

    const handleDocumentPointerMove = (event: PointerEvent) => {
      const anchor = getPreviewAnchor();
      const overAnchor =
        anchor ? isPointInsideRect(anchor.getBoundingClientRect(), event.clientX, event.clientY) : false;
      const overPreview =
        previewRef.current ?
          isPointInsideRect(previewRef.current.getBoundingClientRect(), event.clientX, event.clientY)
        : false;
      if (overAnchor || overPreview) return;

      hidePreview();
    };

    document.addEventListener("pointermove", handleDocumentPointerMove);

    return () => {
      window.removeEventListener("resize", updatePreviewPosition);
      window.removeEventListener("scroll", updatePreviewPosition, true);
      document.removeEventListener("pointermove", handleDocumentPointerMove);
    };
  }, [hidePreview, previewState, updatePreviewPosition]);

  useEffect(() => {
    if (previewState?.status !== "ready") return;

    let frameId = window.requestAnimationFrame(() => {
      frameId = window.requestAnimationFrame(() => {
        updatePreviewPosition();
      });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [previewState?.href, previewState?.status, updatePreviewPosition]);

  return (
    <>
      {markup}
      {previewState?.status === "ready" && previewState.payload ?
        <div
          ref={previewRef}
          className="not-prose pointer-events-none fixed z-40 max-h-[calc(100vh-2rem)] w-[min(22rem,calc(100vw-2rem))] overflow-auto rounded-lg border border-fd-border bg-fd-background px-3 py-2 shadow-lg"
          style={previewStyle}
        >
          <p className="m-0 text-[15px] font-semibold leading-5 text-fd-foreground">
            {previewState.payload.title}
          </p>
          {previewState.payload.description ?
            <p className="m-0 mt-1 text-[13px] leading-5 text-fd-muted-foreground">
              {previewState.payload.description}
            </p>
          : null}
          {previewState.payload.excerpt ?
            <p className="m-0 mt-1.5 text-[13px] leading-5 text-fd-muted-foreground">
              {previewState.payload.excerpt}
            </p>
          : null}
        </div>
      : null}
    </>
  );
};
