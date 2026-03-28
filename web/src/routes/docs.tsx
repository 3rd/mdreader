import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";
import { isRouteErrorResponse, useRouteError } from "react-router";
import { NotFound } from "@/components/NotFound";
import type { Route } from "./+types/docs";
import { BREADCRUMB_DISABLED, PageActions, PageContent, RouteErrorState, useLiveReload } from "./docs-ui";

const FALLBACK_PAGE_DESCRIPTION = "Documentation";

const Page = ({ loaderData }: Route.ComponentProps) => {
  const { page, pagePath, siteTitle, tree } = loaderData;
  const pageDescription = page.description || `${siteTitle} ${FALLBACK_PAGE_DESCRIPTION}`;

  useLiveReload();

  return (
    <DocsLayout nav={{ title: siteTitle }} tree={tree}>
      <DocsPage breadcrumb={BREADCRUMB_DISABLED} toc={page.toc}>
        <title>{page.title}</title>
        <meta content={pageDescription} name="description" />
        <div className="mb-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-4">
            <div className="min-w-0 flex-1 [&_h1]:!mb-0">
              <DocsTitle>{page.title}</DocsTitle>
            </div>
            <PageActions pagePath={pagePath} />
          </div>
          {page.description ?
            <DocsDescription className="mt-3 !mb-0">{page.description}</DocsDescription>
          : null}
        </div>
        <DocsBody>
          <PageContent segments={page.segments} />
        </DocsBody>
      </DocsPage>
    </DocsLayout>
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
