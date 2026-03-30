import { useEffect } from "react";
import type { RefObject } from "react";

const HIGHLIGHTING_CLASS = "diagram-highlighting";

const NODE_ID_PATTERN = /flowchart-(.+)-\d+$/;
const EDGE_ID_PATTERN = /^L_(.+)_(\d+)$/;

const BASE_STYLES = `
g.node {
  cursor: pointer;
  transition: opacity 200ms ease, filter 200ms ease;
}
path[data-edge] {
  transition: opacity 200ms ease, stroke-opacity 200ms ease;
}
.edgeLabel {
  transition: opacity 200ms ease;
}
.${HIGHLIGHTING_CLASS} g.node {
  opacity: 0.12;
  filter: saturate(0.2);
}
.${HIGHLIGHTING_CLASS} path[data-edge] {
  opacity: 0.08;
}
.${HIGHLIGHTING_CLASS} .edgeLabel {
  opacity: 0.08;
}
@media (prefers-reduced-motion: reduce) {
  g.node, path[data-edge], .edgeLabel {
    transition: none;
  }
}`;

interface NodeConnections {
  edgeDataIds: Set<string>;
  neighborIds: Set<string>;
}

interface ConnectivityData {
  connectionsByNode: Map<string, NodeConnections>;
  nodeDomIds: Map<string, string>;
}

const extractNodeId = (domId: string) => {
  const match = NODE_ID_PATTERN.exec(domId);
  return match?.[1] ?? null;
};

const escapeAttr = (value: string) => value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

const parseEdgeEndpoints = (dataId: string, sortedNodeIds: string[], nodeIdSet: Set<string>) => {
  const match = EDGE_ID_PATTERN.exec(dataId);
  if (!match) return null;

  const fromTo = match[1];

  for (const nodeId of sortedNodeIds) {
    const prefix = `${nodeId}_`;
    if (!fromTo.startsWith(prefix)) continue;

    const remainder = fromTo.slice(prefix.length);
    if (nodeIdSet.has(remainder)) return { source: nodeId, target: remainder };
  }

  return null;
};

const buildConnectivityData = (svg: SVGSVGElement): ConnectivityData | null => {
  const nodeDomIds = new Map<string, string>();

  for (const el of svg.querySelectorAll("g.node")) {
    const domId = el.getAttribute("id");
    if (!domId) continue;

    const nodeId = extractNodeId(domId);
    if (nodeId) nodeDomIds.set(nodeId, domId);
  }

  if (nodeDomIds.size === 0) return null;

  const sortedNodeIds = [...nodeDomIds.keys()].sort((a, b) => b.length - a.length);
  const nodeIdSet = new Set<string>(sortedNodeIds);
  const connectionsByNode = new Map<string, NodeConnections>();

  const ensure = (nodeId: string): NodeConnections => {
    let c = connectionsByNode.get(nodeId);
    if (!c) {
      c = { edgeDataIds: new Set(), neighborIds: new Set() };
      connectionsByNode.set(nodeId, c);
    }
    return c;
  };

  for (const pathEl of svg.querySelectorAll<HTMLElement>("path[data-id]")) {
    const dataId = pathEl.dataset.id;
    if (!dataId) continue;

    const endpoints = parseEdgeEndpoints(dataId, sortedNodeIds, nodeIdSet);
    if (!endpoints) continue;

    const src = ensure(endpoints.source);
    src.edgeDataIds.add(dataId);
    src.neighborIds.add(endpoints.target);

    if (endpoints.source !== endpoints.target) {
      const tgt = ensure(endpoints.target);
      tgt.edgeDataIds.add(dataId);
      tgt.neighborIds.add(endpoints.source);
    }
  }

  return { connectionsByNode, nodeDomIds };
};

// generate CSS rules that un-dim highlighted elements by their inherent attributes
const buildHighlightRules = (nodeId: string, data: ConnectivityData) => {
  const nodeSelectors: string[] = [];
  const edgeSelectors: string[] = [];
  const labelSelectors: string[] = [];
  const pre = `.${HIGHLIGHTING_CLASS}`;

  const addNode = (id: string) => {
    const domId = data.nodeDomIds.get(id);
    if (domId) nodeSelectors.push(`${pre} g.node[id="${escapeAttr(domId)}"]`);
  };

  addNode(nodeId);

  const connections = data.connectionsByNode.get(nodeId);
  if (connections) {
    for (const neighborId of connections.neighborIds) addNode(neighborId);

    for (const edgeDataId of connections.edgeDataIds) {
      const escaped = escapeAttr(edgeDataId);
      edgeSelectors.push(`${pre} path[data-id="${escaped}"]`);
      labelSelectors.push(`${pre} .edgeLabel:has(.label[data-id="${escaped}"])`);
    }
  }

  const rules: string[] = [];

  if (nodeSelectors.length > 0) {
    rules.push(`${nodeSelectors.join(",")}{opacity:1;filter:saturate(1)}`);
  }
  if (edgeSelectors.length > 0) {
    rules.push(`${edgeSelectors.join(",")}{opacity:1;stroke-opacity:1}`);
  }
  if (labelSelectors.length > 0) {
    rules.push(`${labelSelectors.join(",")}{opacity:1}`);
  }

  return rules.join("\n");
};

export const useDiagramHighlight = (
  containerRef: RefObject<HTMLDivElement | null>,
  svg: string | null,
  isEnabled = true,
) => {
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !svg || !isEnabled) return;

    const svgElement = container.querySelector<SVGSVGElement>("svg");
    if (!svgElement) return;

    const data = buildConnectivityData(svgElement);
    if (!data) return;

    const baseStyleEl = document.createElement("style");
    baseStyleEl.textContent = BASE_STYLES;

    const hlStyleEl = document.createElement("style");

    // highlight styles must come AFTER base styles in DOM order to win at equal specificity
    container.prepend(hlStyleEl);
    container.prepend(baseStyleEl);

    let activeNodeId: string | null = null;
    const clearHighlight = () => {
      activeNodeId = null;
      container.classList.remove(HIGHLIGHTING_CLASS);
      hlStyleEl.textContent = "";
    };

    const applyHighlight = (nodeId: string) => {
      if (nodeId === activeNodeId) return;

      activeNodeId = nodeId;
      container.classList.add(HIGHLIGHTING_CLASS);
      hlStyleEl.textContent = buildHighlightRules(nodeId, data);
    };

    const handleMouseOver = (event: Event) => {
      if (event instanceof MouseEvent && event.buttons > 0) return;

      const target = event.target;
      if (!(target instanceof Element)) return;

      const nodeGroup = target.closest("g.node");
      if (!nodeGroup) {
        if (activeNodeId) clearHighlight();
        return;
      }

      const domId = nodeGroup.getAttribute("id");
      if (!domId) return;

      const nodeId = extractNodeId(domId);
      if (nodeId) applyHighlight(nodeId);
    };

    const handleMouseLeave = () => {
      clearHighlight();
    };

    container.addEventListener("mouseover", handleMouseOver);
    container.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      clearHighlight();
      container.removeEventListener("mouseover", handleMouseOver);
      container.removeEventListener("mouseleave", handleMouseLeave);
      baseStyleEl.remove();
      hlStyleEl.remove();
    };
  }, [containerRef, isEnabled, svg]);
};
