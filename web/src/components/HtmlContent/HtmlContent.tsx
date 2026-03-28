/* eslint-disable react/no-danger */

import type { CSSProperties, MouseEvent } from "react";
import { useNavigate } from "react-router";
import { SERVABLE_EXTENSIONS } from "../../../../src/constants";

const NON_DOC_ROUTE_EXTENSIONS = new Set([".css", ".js", ".map", ".woff", ".woff2", ...SERVABLE_EXTENSIONS]);

const getPathExtension = (pathname: string) => {
  const lastSegment = pathname.split("/").at(-1) ?? "";
  const lastDotIndex = lastSegment.lastIndexOf(".");
  if (lastDotIndex <= 0) return "";
  return lastSegment.slice(lastDotIndex).toLowerCase();
};

interface HtmlContentProps {
  className?: string;
  html: string;
  style?: CSSProperties;
  withInternalLinkNavigation?: boolean;
}

const getInternalHref = (anchor: HTMLAnchorElement) => {
  const rawHref = anchor.getAttribute("href");
  if (!rawHref || rawHref.startsWith("#")) return null;
  if (anchor.target && anchor.target !== "_self") return null;
  if (anchor.hasAttribute("download")) return null;

  const destination = new URL(anchor.href, window.location.href);
  if (destination.origin !== window.location.origin) return null;
  if (destination.pathname.startsWith("/api/")) return null;
  if (NON_DOC_ROUTE_EXTENSIONS.has(getPathExtension(destination.pathname))) return null;

  return `${destination.pathname}${destination.search}${destination.hash}`;
};

export const HtmlContent = ({
  className,
  html,
  style,
  withInternalLinkNavigation = true,
}: HtmlContentProps) => {
  const navigate = useNavigate();

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!withInternalLinkNavigation) return;
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const anchor = target.closest("a");
    if (!(anchor instanceof HTMLAnchorElement)) return;

    const nextHref = getInternalHref(anchor);
    if (!nextHref) return;

    event.preventDefault();
    navigate(nextHref);
  };

  return (
    <div
      dangerouslySetInnerHTML={{ __html: html }}
      className={className}
      style={style}
      onClick={handleClick}
    />
  );
};
