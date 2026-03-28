import net from "node:net";
import { DEFAULT_PORT, PORT_SCAN_RANGE } from "../constants";

const isPortAvailable = (port: number) => {
  return new Promise<boolean>((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
  });
};

export const findAvailablePort = async (preferred?: number) => {
  const start = preferred ?? DEFAULT_PORT;
  const end = start + PORT_SCAN_RANGE;

  for (let port = start; port < end; port += 1) {
    if (await isPortAvailable(port)) return port;
  }

  throw new Error(`no available port found in range ${start}-${end - 1}`);
};
