import path from "node:path";
import type { ServerResponse } from "node:http";
import type { HtmlContentSegment } from "../../types";

const CONTENT_DISPOSITION_HEADER = "Content-Disposition";
const EXPORT_FILENAME_SANITIZE_PATTERN = /[^\w.-]+/gi;

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".mp4": "video/mp4",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webm": "video/webm",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
} as const;

export const HTML_CONTENT_TYPE = "text/html; charset=utf-8";
export const JSON_CONTENT_TYPE = "application/json; charset=utf-8";
export const MARKDOWN_CONTENT_TYPE = "text/markdown; charset=utf-8";
export const EVENT_STREAM_CONTENT_TYPE = "text/event-stream";
export const TEXT_ASSET_EXTENSIONS = new Set([".css", ".html", ".js", ".json", ".map", ".svg", ".txt"]);
const TEXT_CONTENT_TYPE = "text/plain; charset=utf-8";

export interface RouteResponse {
  body: Buffer | string;
  contentType: string;
  headers?: Record<string, string>;
  status?: number;
}

export const createHtmlSegment = (content: string): HtmlContentSegment => {
  return {
    type: "html",
    content,
  };
};

export const getContentType = (filePath: string) => {
  return CONTENT_TYPES[path.extname(filePath)] ?? "application/octet-stream";
};

export const jsonResponse = <T>(data: T): RouteResponse => {
  return {
    body: JSON.stringify(data),
    contentType: JSON_CONTENT_TYPE,
  };
};

export const textResponse = (body: string, status = 200): RouteResponse => {
  return {
    body,
    contentType: TEXT_CONTENT_TYPE,
    status,
  };
};

export const htmlResponse = (body: string): RouteResponse => {
  return {
    body,
    contentType: HTML_CONTENT_TYPE,
  };
};

export const createDownloadResponse = (
  body: Buffer | string,
  contentType: string,
  filename: string,
): RouteResponse => {
  return {
    body,
    contentType,
    headers: {
      [CONTENT_DISPOSITION_HEADER]: `attachment; filename="${filename.replace(EXPORT_FILENAME_SANITIZE_PATTERN, "-")}"`,
    },
  };
};

export const writeResponse = (response: ServerResponse, payload: RouteResponse) => {
  response.writeHead(payload.status ?? 200, {
    "Content-Type": payload.contentType,
    ...payload.headers,
  });
  response.end(payload.body);
};
