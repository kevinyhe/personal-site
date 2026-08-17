"use client";

export type ViewportMetrics = {
  height: number;
  width: number;
};

function readDocumentDimension(axis: "height" | "width") {
  if (typeof document === "undefined") return 1;
  const element = document.documentElement;
  return axis === "height" ? element.clientHeight : element.clientWidth;
}

export function getViewportMetrics(): ViewportMetrics {
  if (typeof window === "undefined") {
    return { height: 1, width: 1 };
  }

  const visualViewport = window.visualViewport;
  const height =
    visualViewport?.height ??
    readDocumentDimension("height") ??
    window.innerHeight ??
    1;
  const width =
    visualViewport?.width ??
    readDocumentDimension("width") ??
    window.innerWidth ??
    1;

  return {
    height: Math.max(1, height),
    width: Math.max(1, width),
  };
}

export function getViewportHeight() {
  return getViewportMetrics().height;
}

export function getViewportWidth() {
  return getViewportMetrics().width;
}

export function addViewportChangeListener(listener: () => void) {
  if (typeof window === "undefined") return () => undefined;

  const visualViewport = window.visualViewport;
  window.addEventListener("resize", listener);
  window.addEventListener("orientationchange", listener);
  visualViewport?.addEventListener("resize", listener);

  return () => {
    window.removeEventListener("resize", listener);
    window.removeEventListener("orientationchange", listener);
    visualViewport?.removeEventListener("resize", listener);
  };
}
