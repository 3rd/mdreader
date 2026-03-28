import type { IncomingMessage, ServerResponse } from "node:http";
import { EVENT_STREAM_CONTENT_TYPE } from "./responses";

export interface LiveReloadChannel {
  close: () => void;
  handleEventStreamRequest: (request: IncomingMessage, response: ServerResponse) => void;
  notifyReload: () => void;
}

export const createLiveReloadChannel = (): LiveReloadChannel => {
  const sseClients = new Set<ServerResponse>();

  return {
    close: () => {
      for (const response of sseClients) {
        try {
          response.end();
        } catch {
          // ignore write/close errors while shutting down
        }
      }
      sseClients.clear();
    },
    notifyReload: () => {
      for (const response of sseClients) {
        try {
          response.write("data: reload\n\n");
        } catch {
          sseClients.delete(response);
        }
      }
    },
    handleEventStreamRequest: (request, response) => {
      response.writeHead(200, {
        "Content-Type": EVENT_STREAM_CONTENT_TYPE,
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      response.write("data: connected\n\n");
      sseClients.add(response);

      const cleanup = () => {
        sseClients.delete(response);
      };

      request.on("close", cleanup);
      response.on("close", cleanup);
    },
  };
};
