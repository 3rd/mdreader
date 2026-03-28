import { spawn } from "node:child_process";
import { networkInterfaces } from "node:os";
import type { SpawnOptions } from "node:child_process";

const BROWSER_SPAWN_OPTIONS = {
  detached: true,
  stdio: "ignore",
  windowsHide: true,
} satisfies SpawnOptions;

const getBrowserLaunchCommand = (url: string) => {
  if (process.platform === "darwin") return { command: "open", args: [url] };
  if (process.platform === "win32") return { command: "cmd", args: ["/c", "start", "", url] };

  return { command: "xdg-open", args: [url] };
};

export const openInBrowser = (url: string) => {
  const { command, args } = getBrowserLaunchCommand(url);
  const child = spawn(command, args, BROWSER_SPAWN_OPTIONS);
  child.on("error", () => {
    // ignore failure to open
  });
  child.unref();
};

const isWildcardHost = (host: string | undefined) => host === "0.0.0.0" || host === "::";

const formatHostForUrl = (host: string) => (host.includes(":") && !host.startsWith("[") ? `[${host}]` : host);

const getNetworkUrls = (port: number) => {
  const urls = new Set<string>();

  for (const addresses of Object.values(networkInterfaces())) {
    if (!addresses) continue;

    for (const address of addresses) {
      if (address.internal) continue;
      if (address.family !== "IPv4") continue;
      urls.add(`http://${address.address}:${port}/`);
    }
  }

  return Array.from(urls).toSorted();
};

export const getServeUrls = (host: string | undefined, port: number) => {
  const localUrl = `http://localhost:${port}/`;
  if (!host || host === "localhost") return { browserUrl: localUrl, urls: [localUrl] };

  if (isWildcardHost(host)) {
    const networkUrls = getNetworkUrls(port);
    return {
      browserUrl: localUrl,
      urls: [localUrl, ...networkUrls],
    };
  }

  const explicitUrl = `http://${formatHostForUrl(host)}:${port}/`;
  return {
    browserUrl: explicitUrl,
    urls: [explicitUrl],
  };
};
