import { useEffect } from "react";
import type { ReactNode } from "react";
import { RootProvider } from "fumadocs-ui/provider/react-router";
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import { useThemeMode } from "@/hooks";
import { API_SEARCH_INDEX_PATH } from "../../src/constants";
import "./app.css";

const SEARCH_CONFIG = { options: { api: API_SEARCH_INDEX_PATH, type: "static" } } as const;
const FAVICON_BY_THEME = {
  dark: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='7' fill='%231e293b'/><path d='M6 24V8h4l6 7.5L22 8h4v16h-4V14.5L16 22l-6-7.5V24H6z' fill='%23e2e8f0'/></svg>",
  light:
    "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='7' fill='%23e2e8f0'/><path d='M6 24V8h4l6 7.5L22 8h4v16h-4V14.5L16 22l-6-7.5V24H6z' fill='%231e293b'/></svg>",
} as const;

const ensureFaviconLink = (): HTMLLinkElement => {
  const existingLink = document.querySelector<HTMLLinkElement>("link#favicon");
  if (existingLink) return existingLink;
  const link = document.createElement("link");
  link.id = "favicon";
  link.rel = "icon";
  link.type = "image/svg+xml";
  document.head.append(link);
  return link;
};

const useFavicon = () => {
  const themeMode = useThemeMode();

  useEffect(() => {
    ensureFaviconLink().setAttribute("href", FAVICON_BY_THEME[themeMode]);
  }, [themeMode]);
};

interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta content="width=device-width, initial-scale=1" name="viewport" />
        <Meta />
        <Links />
      </head>
      <body className="flex flex-col min-h-screen">
        <RootProvider search={SEARCH_CONFIG}>{children}</RootProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
};

const Root = () => {
  useFavicon();

  return <Outlet />;
};

export default Root;

export const HydrateFallback = () => {
  return (
    <div
      aria-busy="true"
      className="flex justify-center items-center min-h-screen text-sm text-fd-muted-foreground"
    >
      Loading docs…
    </div>
  );
};
