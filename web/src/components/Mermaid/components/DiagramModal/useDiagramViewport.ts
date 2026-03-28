import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import type { CSSProperties, MouseEvent, WheelEvent } from "react";

const DEFAULT_SCALE = 1;
const DEFAULT_TRANSLATE = { x: 0, y: 0 };
const MAX_SCALE = 10;
const MIN_SCALE = 0.1;
const ZOOM_IN_FACTOR = 1.1;
const ZOOM_OUT_FACTOR = 0.9;

interface DragState {
  startX: number;
  startY: number;
  x: number;
  y: number;
}

interface DiagramViewport {
  handleMouseDown: (event: MouseEvent<HTMLDivElement>) => void;
  handleWheel: (event: WheelEvent<HTMLDivElement>) => void;
  resetView: () => void;
  style: CSSProperties;
}

const clampScale = (scale: number) => Math.min(Math.max(scale, MIN_SCALE), MAX_SCALE);

export const useDiagramViewport = (onClose: () => void): DiagramViewport => {
  const [scale, setScale] = useState(DEFAULT_SCALE);
  const [translate, setTranslate] = useState(DEFAULT_TRANSLATE);
  const dragStateRef = useRef<DragState | null>(null);

  const resetView = useCallback(() => {
    setScale(DEFAULT_SCALE);
    setTranslate(DEFAULT_TRANSLATE);
  }, []);

  const handleMouseDown = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;

      dragStateRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        x: translate.x,
        y: translate.y,
      };
    },
    [translate.x, translate.y],
  );

  const handleWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const factor = event.deltaY > 0 ? ZOOM_OUT_FACTOR : ZOOM_IN_FACTOR;
    setScale((currentScale) => clampScale(currentScale * factor));
  }, []);

  const handleWindowMouseMove = useEffectEvent((event: globalThis.MouseEvent) => {
    const dragState = dragStateRef.current;
    if (!dragState) return;

    setTranslate({
      x: dragState.x + (event.clientX - dragState.startX),
      y: dragState.y + (event.clientY - dragState.startY),
    });
  });

  const handleWindowMouseUp = useEffectEvent(() => {
    dragStateRef.current = null;
  });

  const handleWindowKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === "Escape") onClose();
  });

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("mouseup", handleWindowMouseUp);
    window.addEventListener("keydown", handleWindowKeyDown);

    return () => {
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup", handleWindowMouseUp);
      window.removeEventListener("keydown", handleWindowKeyDown);
    };
  }, [handleWindowKeyDown, handleWindowMouseMove, handleWindowMouseUp]);

  return {
    handleMouseDown,
    handleWheel,
    resetView,
    style: {
      transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
    },
  };
};
