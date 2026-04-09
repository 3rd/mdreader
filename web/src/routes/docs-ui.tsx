import {
  type MouseEvent,
  type ReactNode,
  startTransition,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { DynamicCodeBlock } from "fumadocs-ui/components/dynamic-codeblock";
import { TOCScrollArea, useTOCItems } from "fumadocs-ui/components/toc";
import { TOCEmpty, TOCItem, TOCItems } from "fumadocs-ui/components/toc/default";
import { I18nLabel } from "fumadocs-ui/contexts/i18n";
import { DocsBody } from "fumadocs-ui/layouts/docs/page";
import {
  ChevronRight,
  EllipsisVertical,
  FileCode2,
  FileJson,
  FileText,
  Link2,
  MonitorPlay,
  Printer,
  Route,
  Text,
} from "lucide-react";
import { Link, useNavigate, useRevalidator } from "react-router";
import type { TOCProps } from "fumadocs-ui/layouts/docs/page/slots/toc";
import { HtmlContent, invalidateLinkPreviewCache } from "@/components/HtmlContent";
import { Mermaid } from "@/components/Mermaid";
import { useDiagramViewport } from "@/components/Mermaid/components/DiagramModal/useDiagramViewport";
import type { ContentSegment, GraphDataPayload, PageDataPayload, RuntimeConfig } from "../../../src/types";
import { API_EVENTS_PATH, API_SITE_EXPORT_JSON_PATH } from "../../../src/constants";
import { pageExportPath, pageUrl } from "../../../src/utils";
import { fetchGraphData, invalidateTreePayload } from "./docs-data";

const ACTION_MENU_TRIGGER_CLASS_NAME =
  "inline-flex size-9 items-center justify-center rounded-full border border-transparent text-fd-muted-foreground transition hover:border-fd-border hover:bg-fd-secondary/50 hover:text-fd-foreground focus-visible:border-fd-border focus-visible:bg-fd-secondary/50 focus-visible:text-fd-foreground focus-visible:ring-2 focus-visible:ring-fd-ring focus-visible:outline-none";
const ACTION_MENU_TRIGGER_OPEN_CLASS_NAME =
  "border-fd-border bg-fd-secondary/60 text-fd-foreground shadow-sm";
const ACTION_MENU_PANEL_CLASS_NAME =
  "absolute right-0 z-20 mt-2 flex min-w-56 flex-col overflow-hidden rounded-xl border border-fd-border bg-fd-background shadow-lg";
const ACTION_MENU_ITEM_CLASS_NAME =
  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-fd-foreground transition hover:bg-fd-accent hover:text-fd-accent-foreground focus-visible:bg-fd-accent focus-visible:text-fd-accent-foreground focus-visible:outline-none";
const ACTION_MENU_ICON_CLASS_NAME = "size-4 shrink-0 text-fd-muted-foreground";
const GRAPH_MODAL_BUTTON_CLASS_NAME =
  "rounded-lg bg-fd-background/90 px-3 py-1.5 text-xs font-medium text-fd-foreground shadow-lg transition hover:bg-fd-accent focus-visible:ring-2 focus-visible:ring-fd-ring focus-visible:outline-none";

const GRAPH_MODAL_HEIGHT = 900;
const GRAPH_MODAL_WIDTH = 1200;
const GRAPH_WIDGET_HEIGHT = 184;
const GRAPH_WIDGET_WIDTH = 256;

let cachedGraphPayloadPromise: Promise<GraphDataPayload> | null = null;

interface GraphEdgeLine {
  from: string;
  to: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
}

type GraphNode = GraphDataPayload["nodes"][number];
type GraphLayoutNode = GraphNode & {
  degree: number;
  distance: number;
  isFocus: boolean;
  radius: number;
  x: number;
  y: number;
};

interface GraphLayout {
  edges: GraphEdgeLine[];
  height: number;
  nodes: GraphLayoutNode[];
  ringRadii: number[];
  width: number;
}

interface SidebarSectionProps {
  children: ReactNode;
  heading: ReactNode;
  isOpen: boolean;
  onToggle: () => void;
}

export const BREADCRUMB_DISABLED = { enabled: false } as const;

const SidebarSection = ({ children, heading, isOpen, onToggle }: SidebarSectionProps) => {
  return (
    <section className="space-y-2.5">
      <button
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-3 text-left text-sm text-fd-muted-foreground transition hover:text-fd-foreground focus-visible:text-fd-foreground focus-visible:outline-none"
        type="button"
        onClick={onToggle}
      >
        <span className="inline-flex items-center gap-1.5">{heading}</span>
        <ChevronRight
          aria-hidden="true"
          className={`size-4 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`}
        />
      </button>
      {isOpen ? children : null}
    </section>
  );
};

const getSegmentBaseKey = (segment: ContentSegment) => {
  if (segment.type === "html") return `html:${segment.content.slice(0, 80)}`;
  if (segment.type === "slide-break") return "slide-break";
  if (segment.lang === "mermaid") return `mermaid:${segment.code.slice(0, 80)}`;
  return `code:${segment.lang}:${segment.code.slice(0, 80)}`;
};

const getRuntimeMode = (): RuntimeConfig["mode"] | undefined => {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { __MDREADER_RUNTIME__?: RuntimeConfig }).__MDREADER_RUNTIME__?.mode;
};

const copyText = async (value: string) => {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();

  try {
    if (!document.execCommand("copy")) throw new Error("copy command failed");
  } finally {
    textarea.remove();
  }
};

const splitSegmentsIntoSlides = (segments: ContentSegment[]) => {
  const slides: ContentSegment[][] = [[]];

  for (const segment of segments) {
    if (segment.type === "slide-break") {
      if (slides.at(-1)?.length) slides.push([]);
      continue;
    }

    slides.at(-1)?.push(segment);
  }

  if (slides.length > 1 && slides.at(-1)?.length === 0) slides.pop();
  return slides.length === 0 ? [[]] : slides;
};

const truncateLabel = (value: string, maxLength: number) => {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
};

const getGraphPayload = () => {
  cachedGraphPayloadPromise ??= fetchGraphData().catch((error: unknown) => {
    cachedGraphPayloadPromise = null;
    throw error;
  });
  return cachedGraphPayloadPromise;
};

const invalidateGraphPayload = () => {
  cachedGraphPayloadPromise = null;
};

const buildAdjacency = (graph: GraphDataPayload) => {
  const adjacency = new Map<string, Set<string>>();

  for (const node of graph.nodes) adjacency.set(node.id, new Set());

  for (const edge of graph.edges) {
    adjacency.get(edge.from)?.add(edge.to);
    adjacency.get(edge.to)?.add(edge.from);
  }

  return adjacency;
};

const buildDistanceMap = (adjacency: Map<string, Set<string>>, focusId: string) => {
  const distances = new Map<string, number>();
  if (!adjacency.has(focusId)) return distances;

  const queue = [focusId];
  distances.set(focusId, 0);

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId) continue;

    const currentDistance = distances.get(currentId) ?? 0;
    for (const neighborId of adjacency.get(currentId) ?? []) {
      if (distances.has(neighborId)) continue;
      distances.set(neighborId, currentDistance + 1);
      queue.push(neighborId);
    }
  }

  return distances;
};

const createGraphLayout = (
  graph: GraphDataPayload,
  requestedFocusId: string,
  mode: "modal" | "widget",
): GraphLayout => {
  const nodes = [...graph.nodes].sort(
    (a: GraphNode, b: GraphNode) => a.title.localeCompare(b.title) || a.url.localeCompare(b.url),
  );
  if (nodes.length === 0) {
    return {
      edges: [],
      height: mode === "widget" ? GRAPH_WIDGET_HEIGHT : GRAPH_MODAL_HEIGHT,
      nodes: [],
      ringRadii: [],
      width: mode === "widget" ? GRAPH_WIDGET_WIDTH : GRAPH_MODAL_WIDTH,
    };
  }

  const focusId =
    nodes.some((node) => node.id === requestedFocusId) ? requestedFocusId : (nodes[0]?.id ?? "");
  const adjacency = buildAdjacency(graph);
  const distances = buildDistanceMap(adjacency, focusId);

  if (mode === "widget") {
    const width = GRAPH_WIDGET_WIDTH;
    const height = GRAPH_WIDGET_HEIGHT;
    const centerX = width / 2;
    const centerY = height / 2 - 4;
    const neighborIds = Array.from(adjacency.get(focusId) ?? []).slice(0, 10);
    const visibleIds = new Set([focusId, ...neighborIds]);
    const visibleNodes = nodes.filter((node) => visibleIds.has(node.id));
    const placedNodes = visibleNodes.map((node) => {
      if (node.id === focusId) {
        return {
          ...node,
          degree: adjacency.get(node.id)?.size ?? 0,
          distance: 0,
          isFocus: true,
          radius: 18,
          x: centerX,
          y: centerY,
        };
      }

      const neighborIndex = neighborIds.indexOf(node.id);
      const angle = (Math.PI * 2 * neighborIndex) / Math.max(1, neighborIds.length) - Math.PI / 2;
      const orbitRadius = 56 + Math.max(0, neighborIds.length - 4) * 4;

      return {
        ...node,
        degree: adjacency.get(node.id)?.size ?? 0,
        distance: distances.get(node.id) ?? Number.POSITIVE_INFINITY,
        isFocus: false,
        radius: 8 + Math.min(5, adjacency.get(node.id)?.size ?? 0),
        x: centerX + Math.cos(angle) * orbitRadius,
        y: centerY + Math.sin(angle) * orbitRadius,
      };
    });

    const positionedNodeIds = new Set(placedNodes.map((node) => node.id));
    const positionedNodeMap = new Map(placedNodes.map((node) => [node.id, node]));
    const edges = graph.edges.flatMap((edge) => {
      if (!positionedNodeIds.has(edge.from) || !positionedNodeIds.has(edge.to)) return [];

      const source = positionedNodeMap.get(edge.from);
      const target = positionedNodeMap.get(edge.to);
      if (!source || !target) return [];

      return [
        {
          from: edge.from,
          to: edge.to,
          sourceX: source.x,
          sourceY: source.y,
          targetX: target.x,
          targetY: target.y,
        },
      ];
    });

    return {
      edges,
      height,
      nodes: placedNodes,
      ringRadii: neighborIds.length > 0 ? [56 + Math.max(0, neighborIds.length - 4) * 4] : [],
      width,
    };
  }

  const width = GRAPH_MODAL_WIDTH;
  const height = GRAPH_MODAL_HEIGHT;
  const centerX = width / 2;
  const centerY = height / 2;
  const ringRadii = [180, 300, 420, 540];
  const buckets = new Map<number, GraphNode[]>();
  const maxBucketIndex = ringRadii.length - 1;

  for (const node of nodes) {
    const rawDistance = distances.get(node.id);
    const distance = rawDistance === undefined ? Number.POSITIVE_INFINITY : rawDistance;
    let bucketIndex = 0;

    if (distance === 0) {
      bucketIndex = 0;
    } else if (Number.isFinite(distance)) {
      bucketIndex = Math.min(maxBucketIndex, Math.max(1, distance));
    } else {
      bucketIndex = maxBucketIndex;
    }

    const bucket = buckets.get(bucketIndex) ?? [];
    bucket.push(node);
    buckets.set(bucketIndex, bucket);
  }

  const placedNodes: GraphLayoutNode[] = [];

  for (const [bucketIndex, bucketNodes] of buckets) {
    if (bucketIndex === 0) {
      const focusNode = bucketNodes[0];
      if (!focusNode) continue;

      placedNodes.push({
        ...focusNode,
        degree: adjacency.get(focusNode.id)?.size ?? 0,
        distance: 0,
        isFocus: true,
        radius: 18,
        x: centerX,
        y: centerY,
      });
      continue;
    }

    const ringRadius = ringRadii[Math.min(maxBucketIndex - 1, bucketIndex - 1)] ?? ringRadii.at(-1) ?? 540;
    const step = (Math.PI * 2) / Math.max(1, bucketNodes.length);
    const startAngle = bucketIndex * 0.35 - Math.PI / 2;

    for (const [index, node] of bucketNodes.entries()) {
      placedNodes.push({
        ...node,
        degree: adjacency.get(node.id)?.size ?? 0,
        distance: distances.get(node.id) ?? Number.POSITIVE_INFINITY,
        isFocus: node.id === focusId,
        radius: Math.max(8, Math.min(14, 8 + (adjacency.get(node.id)?.size ?? 0) * 1.2)),
        x: centerX + Math.cos(startAngle + step * index) * ringRadius,
        y: centerY + Math.sin(startAngle + step * index) * ringRadius,
      });
    }
  }

  const positionedNodeMap = new Map(placedNodes.map((node) => [node.id, node]));
  const edges = graph.edges.flatMap((edge) => {
    const source = positionedNodeMap.get(edge.from);
    const target = positionedNodeMap.get(edge.to);
    if (!source || !target) return [];

    return [
      {
        from: edge.from,
        to: edge.to,
        sourceX: source.x,
        sourceY: source.y,
        targetX: target.x,
        targetY: target.y,
      },
    ];
  });

  return {
    edges,
    height,
    nodes: placedNodes,
    ringRadii,
    width,
  };
};

const useGraphData = (enabled = true) => {
  const [graphState, setGraphState] = useState<
    | { graph: GraphDataPayload; status: "ready" }
    | { message: string; status: "error" }
    | { status: "idle" | "loading" }
  >(enabled ? { status: "loading" } : { status: "idle" });

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    setGraphState((current) => (current.status === "ready" ? current : { status: "loading" }));

    getGraphPayload()
      .then((graph) => {
        if (cancelled) return;
        setGraphState({ graph, status: "ready" });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setGraphState({
          message: error instanceof Error ? error.message : "Unable to load graph data.",
          status: "error",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return graphState;
};

const DocsGraph = ({
  graph,
  mode,
  onSelect,
  requestedFocusId,
}: {
  graph: GraphDataPayload;
  mode: "modal" | "widget";
  onSelect?: (url: string) => void;
  requestedFocusId: string;
}) => {
  const layout = createGraphLayout(graph, requestedFocusId, mode);
  if (layout.nodes.length === 0) return null;

  const gridId = `mdreader-graph-grid-${mode}`;
  const widgetMode = mode === "widget";
  const backgroundFill = widgetMode ? "var(--color-fd-card)" : "var(--color-fd-background)";
  const gridStrokeOpacity = widgetMode ? "0.16" : "0.4";
  const ringStrokeOpacity = widgetMode ? "0.24" : "0.45";

  return (
    <svg
      className={mode === "widget" ? "h-full w-full" : "h-[900px] w-[1200px] max-w-none"}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
    >
      <defs>
        <pattern id={gridId} width="32" height="32" patternUnits="userSpaceOnUse">
          <path
            d="M 32 0 L 0 0 0 32"
            fill="none"
            stroke="var(--color-fd-border)"
            strokeOpacity={gridStrokeOpacity}
            strokeWidth="1"
          />
        </pattern>
      </defs>
      <rect fill={backgroundFill} height={layout.height} rx="24" width={layout.width} />
      <rect fill={`url(#${gridId})`} height={layout.height} rx="24" width={layout.width} />
      {mode === "modal" ?
        <g>
          {layout.ringRadii.map((radius) => (
            <circle
              key={radius}
              cx={layout.width / 2}
              cy={layout.height / 2}
              fill="none"
              r={radius}
              stroke="var(--color-fd-border)"
              strokeOpacity={ringStrokeOpacity}
              strokeDasharray="6 10"
              strokeWidth="1"
            />
          ))}
        </g>
      : null}
      <g>
        {layout.edges.map((edge) => {
          const isFocusEdge = edge.from === requestedFocusId || edge.to === requestedFocusId;
          let edgeStroke = "var(--color-fd-border)";
          let edgeStrokeOpacity = "0.6";
          let edgeStrokeWidth = 1.1;

          if (widgetMode) {
            edgeStroke = "var(--color-fd-muted-foreground)";
            edgeStrokeOpacity = isFocusEdge ? "0.28" : "0.18";
            edgeStrokeWidth = isFocusEdge ? 1.7 : 0.9;
          } else if (isFocusEdge) {
            edgeStroke = "var(--color-fd-foreground)";
            edgeStrokeOpacity = "0.5";
            edgeStrokeWidth = 2.2;
          }
          return (
            <line
              key={`${edge.from}:${edge.to}`}
              stroke={edgeStroke}
              strokeOpacity={edgeStrokeOpacity}
              strokeWidth={edgeStrokeWidth}
              x1={edge.sourceX}
              x2={edge.targetX}
              y1={edge.sourceY}
              y2={edge.targetY}
            />
          );
        })}
      </g>
      <g>
        {layout.nodes.map((node) => {
          const showLabel =
            mode === "widget" ? node.isFocus : node.isFocus || node.distance <= 1 || node.degree >= 4;
          const labelOffset = node.radius + (mode === "widget" ? 14 : 18);
          const label = truncateLabel(node.title, mode === "widget" ? 18 : 26);
          let labelFontSize = "11";
          if (node.isFocus) labelFontSize = mode === "widget" ? "12" : "14";
          const nodeFill = node.isFocus ? "var(--color-fd-foreground)" : "var(--color-fd-muted-foreground)";
          let nodeFillOpacity = node.isFocus ? "1" : "0.85";
          if (widgetMode) nodeFillOpacity = node.isFocus ? "0.9" : "0.5";
          const nodeStroke = widgetMode ? "var(--color-fd-card)" : "var(--color-fd-background)";
          const labelFill =
            widgetMode || !node.isFocus ? "var(--color-fd-muted-foreground)" : "var(--color-fd-foreground)";
          let labelFillOpacity = "1";
          if (widgetMode) labelFillOpacity = node.isFocus ? "0.92" : "0.82";
          let labelFontWeight = "500";
          if (node.isFocus) labelFontWeight = "600";
          else if (widgetMode) labelFontWeight = "400";
          let nodeStrokeWidth = node.isFocus ? 2.5 : 1.25;
          if (widgetMode) nodeStrokeWidth = node.isFocus ? 2 : 1;

          const content = (
            <>
              <title>{node.title}</title>
              <circle
                cx={node.x}
                cy={node.y}
                fill={nodeFill}
                fillOpacity={nodeFillOpacity}
                r={node.radius}
                stroke={nodeStroke}
                strokeWidth={nodeStrokeWidth}
              />
              {showLabel ?
                <text
                  fill={labelFill}
                  fillOpacity={labelFillOpacity}
                  fontSize={labelFontSize}
                  fontWeight={labelFontWeight}
                  textAnchor="middle"
                  x={node.x}
                  y={node.y + labelOffset}
                >
                  {label}
                </text>
              : null}
            </>
          );

          if (!onSelect) return <g key={node.id}>{content}</g>;

          return (
            <a
              key={node.id}
              href={node.url}
              onClick={(event) => {
                event.preventDefault();
                onSelect(node.url);
              }}
            >
              {content}
            </a>
          );
        })}
      </g>
    </svg>
  );
};

const GraphWidget = ({
  isOpen,
  onOpenGraph,
  onToggle,
  pagePath,
}: {
  isOpen: boolean;
  onOpenGraph: () => void;
  onToggle: () => void;
  pagePath: string;
}) => {
  const graphState = useGraphData(isOpen);
  const currentPageUrl = pageUrl(pagePath);
  const graph = graphState.status === "ready" ? graphState.graph : null;
  let graphBody: ReactNode = null;

  if (graphState.status === "loading" || graphState.status === "idle") {
    graphBody = (
      <div className="flex h-44 items-center justify-center text-sm text-fd-muted-foreground">
        Loading graph...
      </div>
    );
  } else if (graphState.status === "error") {
    graphBody = (
      <div className="flex h-44 items-center justify-center px-4 text-center text-sm text-fd-muted-foreground">
        {graphState.message}
      </div>
    );
  } else if (graph) {
    graphBody = (
      <button
        aria-label="Open graph view"
        className="block h-44 w-full cursor-zoom-in transition hover:opacity-95 focus-visible:ring-2 focus-visible:ring-fd-ring focus-visible:outline-none"
        type="button"
        onClick={onOpenGraph}
      >
        <DocsGraph graph={graph} mode="widget" requestedFocusId={currentPageUrl} />
      </button>
    );
  }

  return (
    <SidebarSection
      heading={
        <>
          <Route aria-hidden="true" className="size-4 shrink-0" />
          <span>Map</span>
        </>
      }
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <div className="overflow-hidden rounded-lg border border-fd-border/70 bg-fd-card/35">{graphBody}</div>
    </SidebarSection>
  );
};

const BacklinksSection = ({
  backlinks,
  isOpen,
  onToggle,
}: {
  backlinks: PageDataPayload["backlinks"];
  isOpen: boolean;
  onToggle: () => void;
}) => {
  return (
    <SidebarSection
      heading={
        <>
          <Link2 aria-hidden="true" className="size-4 shrink-0" />
          <span>Backlinks</span>
        </>
      }
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <ul className="space-y-1 border-s border-fd-border/70 ps-3 text-[13px]">
        {backlinks.map((backlink) => (
          <li key={`${backlink.url}:${backlink.title}`}>
            <Link
              className="group flex items-start gap-2 py-0.5 text-fd-muted-foreground transition hover:text-fd-accent-foreground focus-visible:text-fd-accent-foreground focus-visible:outline-none"
              to={backlink.url}
            >
              <FileText
                aria-hidden="true"
                className="mt-0.5 size-3 shrink-0 text-fd-muted-foreground/70 transition group-hover:text-fd-muted-foreground"
              />
              <span className="leading-5">{backlink.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </SidebarSection>
  );
};

export const SidebarFooter = ({
  backlinks,
  onOpenGraph,
  pagePath,
}: {
  backlinks: PageDataPayload["backlinks"];
  onOpenGraph: () => void;
  pagePath: string;
}) => {
  const [isBacklinksOpen, setIsBacklinksOpen] = useState(false);
  const [isMapOpen, setIsMapOpen] = useState(false);

  return (
    <div className="mt-5 space-y-3 border-t border-fd-border py-4">
      {backlinks.length > 0 ?
        <BacklinksSection
          backlinks={backlinks}
          isOpen={isBacklinksOpen}
          onToggle={() => setIsBacklinksOpen((open) => !open)}
        />
      : null}
      <GraphWidget
        isOpen={isMapOpen}
        pagePath={pagePath}
        onOpenGraph={onOpenGraph}
        onToggle={() => setIsMapOpen((open) => !open)}
      />
    </div>
  );
};

export const PageToc = ({ container, footer, header }: TOCProps) => {
  const items = useTOCItems();
  const { className, ...containerProps } = container ?? {};

  return (
    <div
      id="nd-toc"
      {...containerProps}
      className={[
        "sticky top-(--fd-docs-row-1) h-[calc(var(--fd-docs-height)-var(--fd-docs-row-1))] flex flex-col [grid-area:toc] w-(--fd-toc-width) pt-12 pe-4 pb-2 max-xl:hidden",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {header}
      <h3 id="toc-title" className="inline-flex items-center gap-1.5 text-sm text-fd-muted-foreground">
        <Text className="size-4" />
        <I18nLabel label="toc" />
      </h3>
      <TOCScrollArea>
        {items.length === 0 ?
          <TOCEmpty />
        : <TOCItems>
            {items.map((item) => (
              <TOCItem key={item.url} item={item} />
            ))}
          </TOCItems>
        }
      </TOCScrollArea>
      {footer}
    </div>
  );
};

export const PageContent = ({ segments }: { segments: ContentSegment[] }) => {
  const segmentKeyCounts = new Map<string, number>();

  return (
    <>
      {segments.map((segment) => {
        const baseKey = getSegmentBaseKey(segment);
        const count = (segmentKeyCounts.get(baseKey) ?? 0) + 1;
        const key = count === 1 ? baseKey : `${baseKey}:${count}`;
        segmentKeyCounts.set(baseKey, count);

        if (segment.type === "html") return <HtmlContent key={key} html={segment.content} />;
        if (segment.type === "slide-break") return <hr key={key} className="my-8 border-fd-border" />;

        if (segment.lang === "mermaid") {
          return (
            <div key={key} className="not-prose">
              <Mermaid code={segment.code} />
            </div>
          );
        }

        return (
          <div key={key} className="my-4 not-prose">
            <DynamicCodeBlock code={segment.code} lang={segment.lang} />
          </div>
        );
      })}
    </>
  );
};

export const useLiveReload = () => {
  const { revalidate } = useRevalidator();
  const handleMessage = useEffectEvent((event: MessageEvent<string>) => {
    if (event.data === "hard-reload") {
      window.location.reload();
      return;
    }
    if (event.data !== "reload") return;

    invalidateTreePayload();
    invalidateGraphPayload();
    invalidateLinkPreviewCache();
    startTransition(() => {
      revalidate();
    });
  });

  useEffect(() => {
    if (getRuntimeMode() !== "serve") return;

    const eventSource = new EventSource(API_EVENTS_PATH);
    eventSource.addEventListener("message", handleMessage);

    return () => eventSource.close();
  }, [handleMessage]);
};

export const PageActions = ({
  onStartPresentation,
  pagePath,
}: {
  onStartPresentation: () => void;
  pagePath: string;
}) => {
  const [copyState, setCopyState] = useState<"copied" | "error" | "idle">("idle");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const markdownExportPath = pageExportPath(pagePath, "markdown");
  const exportLinks = [
    { href: pageExportPath(pagePath, "html"), icon: FileCode2, label: "Export HTML" },
    { href: pageExportPath(pagePath, "json"), icon: FileJson, label: "Export JSON" },
    { href: API_SITE_EXPORT_JSON_PATH, icon: FileJson, label: "Export Site JSON" },
  ] as const;

  useEffect(() => {
    if (copyState === "idle") return;

    const timeoutId = window.setTimeout(() => {
      setCopyState("idle");
    }, 1500);

    return () => window.clearTimeout(timeoutId);
  }, [copyState]);

  const closeMenu = () => {
    setIsMenuOpen(false);
  };

  const handleDocumentPointerDown = useEffectEvent((event: PointerEvent) => {
    const target = event.target;
    if (!(target instanceof Node) || menuRef.current?.contains(target)) return;

    setIsMenuOpen(false);
  });

  const handleDocumentKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === "Escape") setIsMenuOpen(false);
  });

  useEffect(() => {
    if (!isMenuOpen) return;

    document.addEventListener("pointerdown", handleDocumentPointerDown);
    document.addEventListener("keydown", handleDocumentKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handleDocumentPointerDown);
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [handleDocumentKeyDown, handleDocumentPointerDown, isMenuOpen]);

  const handleCopyMarkdown = async () => {
    try {
      const response = await fetch(markdownExportPath);
      if (!response.ok) throw new Error(`failed to fetch markdown: ${response.status}`);

      await copyText(await response.text());
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }

    closeMenu();
  };

  return (
    <div className="not-prose md:ml-auto">
      <div ref={menuRef} className="relative">
        <button
          aria-label="Page actions"
          aria-expanded={isMenuOpen}
          className={`${ACTION_MENU_TRIGGER_CLASS_NAME} ${isMenuOpen ? ACTION_MENU_TRIGGER_OPEN_CLASS_NAME : ""}`}
          title="Page actions"
          type="button"
          onClick={() => setIsMenuOpen((open) => !open)}
        >
          <EllipsisVertical aria-hidden="true" className="size-4 shrink-0" />
        </button>
        {isMenuOpen ?
          <div className={ACTION_MENU_PANEL_CLASS_NAME}>
            <button
              className={ACTION_MENU_ITEM_CLASS_NAME}
              type="button"
              onClick={() => {
                closeMenu();
                window.print();
              }}
            >
              <Printer aria-hidden="true" className={ACTION_MENU_ICON_CLASS_NAME} />
              Print
            </button>
            <button
              className={ACTION_MENU_ITEM_CLASS_NAME}
              type="button"
              onClick={() => {
                closeMenu();
                onStartPresentation();
              }}
            >
              <MonitorPlay aria-hidden="true" className={ACTION_MENU_ICON_CLASS_NAME} />
              Present
            </button>
            <button className={ACTION_MENU_ITEM_CLASS_NAME} type="button" onClick={handleCopyMarkdown}>
              <FileText aria-hidden="true" className={ACTION_MENU_ICON_CLASS_NAME} />
              {copyState === "copied" ? "Copied Markdown" : "Copy Markdown"}
            </button>
            <a className={ACTION_MENU_ITEM_CLASS_NAME} href={markdownExportPath} onClick={closeMenu}>
              <FileText aria-hidden="true" className={ACTION_MENU_ICON_CLASS_NAME} />
              Export Markdown
            </a>
            {exportLinks.map(({ href, icon: Icon, label }) => (
              <a key={label} className={ACTION_MENU_ITEM_CLASS_NAME} href={href} onClick={closeMenu}>
                <Icon aria-hidden="true" className={ACTION_MENU_ICON_CLASS_NAME} />
                {label}
              </a>
            ))}
          </div>
        : null}
      </div>
      {copyState === "error" ?
        <p className="mt-2 text-xs text-fd-muted-foreground md:text-right">Unable to copy Markdown.</p>
      : null}
    </div>
  );
};

export const GraphModal = ({ onClose, pagePath }: { onClose: () => void; pagePath: string }) => {
  const navigate = useNavigate();
  const graphState = useGraphData();
  const graph = graphState.status === "ready" ? graphState.graph : null;
  const { handleMouseDown, handleWheel, resetView, style } = useDiagramViewport(onClose);
  let graphBody: ReactNode = null;

  if (graphState.status === "loading" || graphState.status === "idle") {
    graphBody = (
      <div className="rounded-2xl border border-fd-border bg-fd-background/90 px-6 py-4 text-sm text-fd-muted-foreground shadow-lg">
        Loading graph...
      </div>
    );
  } else if (graphState.status === "error") {
    graphBody = (
      <div className="rounded-2xl border border-fd-border bg-fd-background/90 px-6 py-4 text-sm text-fd-muted-foreground shadow-lg">
        {graphState.message}
      </div>
    );
  } else if (graph) {
    graphBody = (
      <DocsGraph
        graph={graph}
        mode="modal"
        requestedFocusId={pageUrl(pagePath)}
        onSelect={(url) => {
          onClose();
          navigate(url);
        }}
      />
    );
  }

  return (
    <div
      aria-label="Documentation graph"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
    >
      <div className="absolute top-4 right-4 z-[60] flex gap-2">
        <button className={GRAPH_MODAL_BUTTON_CLASS_NAME} type="button" onClick={resetView}>
          Reset
        </button>
        <button
          aria-label="Close graph view"
          className={GRAPH_MODAL_BUTTON_CLASS_NAME}
          type="button"
          onClick={onClose}
        >
          Esc
        </button>
      </div>
      <div
        className="h-full w-full cursor-grab select-none overflow-hidden active:cursor-grabbing"
        onClick={onClose}
        onMouseDown={handleMouseDown}
        onWheel={handleWheel}
      >
        <div className="flex h-full w-full items-center justify-center" style={style}>
          <div
            onClick={(event: MouseEvent<HTMLDivElement>) => {
              event.stopPropagation();
            }}
          >
            {graphBody}
          </div>
        </div>
      </div>
    </div>
  );
};

export const PresentationMode = ({
  onChangeSlide,
  onExit,
  page,
  slideIndex,
}: {
  onChangeSlide: (index: number) => void;
  onExit: () => void;
  page: PageDataPayload;
  slideIndex: number;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const slides = splitSegmentsIntoSlides(page.segments);
  const hasMultipleSlides = slides.length > 1;
  const activeSlideIndex = Math.max(0, Math.min(slides.length - 1, slideIndex));
  const activeSlide = slides[activeSlideIndex] ?? [];

  const handleWindowKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onExit();
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      onChangeSlide(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      onChangeSlide(slides.length - 1);
      return;
    }

    if (event.key === "ArrowRight" || event.key === "PageDown" || event.key === " ") {
      event.preventDefault();
      onChangeSlide(Math.min(slides.length - 1, activeSlideIndex + 1));
      return;
    }

    if (event.key === "ArrowLeft" || event.key === "PageUp") {
      event.preventDefault();
      onChangeSlide(Math.max(0, activeSlideIndex - 1));
    }
  });

  const handleFullscreenChange = useEffectEvent(() => {
    setIsFullscreen(document.fullscreenElement === containerRef.current);
  });

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement === containerRef.current) {
        await document.exitFullscreen();
        return;
      }

      const container = containerRef.current;
      if (!container) return;
      await container.requestFullscreen();
    } catch {
      // ignore fullscreen failures
    }
  };

  useEffect(() => {
    const container = containerRef.current;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleWindowKeyDown);
    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleWindowKeyDown);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      if (document.fullscreenElement === container) {
        void document.exitFullscreen().catch(() => {
          // ignore fullscreen cleanup failures
        });
      }
    };
  }, [handleFullscreenChange, handleWindowKeyDown]);

  return (
    <div ref={containerRef} className="fixed inset-0 z-50 overflow-auto bg-fd-background text-fd-foreground">
      {hasMultipleSlides ?
        <div className="absolute top-4 right-4 z-[60] flex items-center gap-2">
          <div className="rounded-lg border border-fd-border bg-fd-background px-3 py-1.5 text-sm text-fd-muted-foreground shadow-sm">
            {activeSlideIndex + 1} / {slides.length}
          </div>
          <button
            aria-pressed={isFullscreen}
            className="rounded-lg border border-fd-border bg-fd-background px-3 py-1.5 text-sm text-fd-foreground shadow-sm transition hover:bg-fd-accent focus-visible:ring-2 focus-visible:ring-fd-ring focus-visible:outline-none"
            type="button"
            onClick={() => {
              void toggleFullscreen();
            }}
          >
            {isFullscreen ? "Windowed" : "Fullscreen"}
          </button>
          <button
            className="rounded-lg border border-fd-border bg-fd-background px-3 py-1.5 text-sm text-fd-foreground shadow-sm transition hover:bg-fd-accent focus-visible:ring-2 focus-visible:ring-fd-ring focus-visible:outline-none"
            type="button"
            onClick={onExit}
          >
            Exit
          </button>
        </div>
      : null}
      <div className="mx-auto flex min-h-full w-full max-w-5xl items-center px-6 py-20 md:px-10">
        <article className="w-full">
          <DocsBody className="w-full max-w-none">
            <PageContent segments={activeSlide} />
          </DocsBody>
        </article>
      </div>
      {hasMultipleSlides ?
        <div className="fixed right-1/2 bottom-6 z-[60] translate-x-1/2">
          <div className="flex items-center gap-2 rounded-full border border-fd-border bg-fd-background px-3 py-2 shadow-lg">
            <button
              className="rounded-full px-4 py-2 text-sm text-fd-foreground transition hover:bg-fd-accent focus-visible:ring-2 focus-visible:ring-fd-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              disabled={activeSlideIndex === 0}
              type="button"
              onClick={() => onChangeSlide(Math.max(0, activeSlideIndex - 1))}
            >
              Prev
            </button>
            <button
              className="rounded-full px-4 py-2 text-sm text-fd-foreground transition hover:bg-fd-accent focus-visible:ring-2 focus-visible:ring-fd-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              disabled={activeSlideIndex === slides.length - 1}
              type="button"
              onClick={() => onChangeSlide(Math.min(slides.length - 1, activeSlideIndex + 1))}
            >
              Next
            </button>
          </div>
        </div>
      : null}
    </div>
  );
};

export const RouteErrorState = ({ message }: { message: string }) => {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-3xl font-semibold text-fd-foreground">Unable to load this page</h1>
      <p className="max-w-xl text-sm text-fd-muted-foreground">{message}</p>
    </div>
  );
};
