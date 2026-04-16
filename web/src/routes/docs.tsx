import { useCallback, useEffect, useMemo, useState } from "react";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
  PageLastUpdate,
} from "fumadocs-ui/layouts/docs/page";
import { isRouteErrorResponse, useRouteError, useSearchParams } from "react-router";
import { NotFound } from "@/components/NotFound";
import type { Route } from "./+types/docs";
import {
  BREADCRUMB_DISABLED,
  GraphModal,
  PageActions,
  PageContent,
  PageToc,
  PresentationMode,
  RouteErrorState,
  SidebarFooter,
  useLiveReload,
} from "./docs-ui";

const FALLBACK_PAGE_DESCRIPTION = "Documentation";

const Page = ({ loaderData }: Route.ComponentProps) => {
  const { page, pagePath, siteTitle, tree } = loaderData;
  const pageDescription = page.description || `${siteTitle} ${FALLBACK_PAGE_DESCRIPTION}`;
  const [searchParams, setSearchParams] = useSearchParams();
  const [isGraphOpen, setIsGraphOpen] = useState(false);
  const isPresentationMode = searchParams.get("presentation") === "1";
  const requestedSlide = Math.max(0, Number(searchParams.get("slide") ?? "1") - 1 || 0);
  const openGraph = useCallback(() => {
    setIsGraphOpen(true);
  }, []);

  useLiveReload();
  useEffect(() => {
    setIsGraphOpen(false);
  }, [pagePath]);

  const docsLayoutNav = useMemo(
    () => {
      return ({
        title: siteTitle,
      })
    },
    [siteTitle],
  );

  const tableOfContent = useMemo(
    () => {
      return ({
        component: (
          <PageToc
            footer={<SidebarFooter backlinks={page.backlinks} pagePath={pagePath} onOpenGraph={openGraph} />}
          />
        ),
        enabled: true,
      })
    },
    [openGraph, page.backlinks, pagePath],
  );

  const setPresentationMode = (enabled: boolean, slideIndex = 0, replace = false) => {
    const nextParams = new URLSearchParams(searchParams);

    if (enabled) {
      nextParams.set("presentation", "1");
      nextParams.set("slide", String(slideIndex + 1));
    } else {
      nextParams.delete("presentation");
      nextParams.delete("slide");
    }

    setSearchParams(nextParams, { replace });
  };

  if (isPresentationMode) {
    return (
      <PresentationMode
        page={page}
        slideIndex={requestedSlide}
        onChangeSlide={(slideIndex) => setPresentationMode(true, slideIndex, true)}
        onExit={() => setPresentationMode(false)}
      />
    );
  }

  return (
    <>
      <DocsLayout nav={docsLayoutNav} tree={tree}>
        <DocsPage breadcrumb={BREADCRUMB_DISABLED} tableOfContent={tableOfContent} toc={page.toc}>
          <title>{page.title}</title>
          <meta content={pageDescription} name="description" />
          <div className="mb-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-4">
              <div className="min-w-0 flex-1 [&_h1]:!mb-0">
                <DocsTitle>{page.title}</DocsTitle>
              </div>
              <PageActions pagePath={pagePath} onStartPresentation={() => setPresentationMode(true)} />
            </div>
            {page.description ?
              <DocsDescription className="mt-3 !mb-0">{page.description}</DocsDescription>
            : null}
            {page.lastUpdated ?
              <div className="mt-4">
                <PageLastUpdate
                  date={new Date(page.lastUpdated.at)}
                  title={`last commit ${page.lastUpdated.commit.slice(0, 7)}`}
                />
              </div>
            : null}
          </div>
          <DocsBody>
            <PageContent segments={page.segments} />
          </DocsBody>
        </DocsPage>
      </DocsLayout>
      {isGraphOpen ?
        <GraphModal pagePath={pagePath} onClose={() => setIsGraphOpen(false)} />
      : null}
    </>
  );
};

export default Page;

export const ErrorBoundary = () => {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFound />;

  const message = error instanceof Error ? error.message : "Something went wrong while loading this page.";
  return <RouteErrorState message={message} />;
};

export { clientLoader } from "./docs-data";
