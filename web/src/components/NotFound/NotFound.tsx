import { Link } from "react-router";

export const NotFound = () => {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-4xl font-bold text-fd-foreground">404</h1>
      <p className="text-fd-muted-foreground">Page not found</p>
      <Link
        className="rounded-lg bg-fd-primary px-4 py-2 text-sm font-medium text-fd-primary-foreground transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-fd-ring focus-visible:outline-none"
        to="/"
      >
        Go home
      </Link>
    </div>
  );
};
