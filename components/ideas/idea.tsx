"use client";

import { createContext, useContext, useEffect, type JSX, type ReactNode } from "react";

/**
 * Which idea /i/N has switched on; 0 on the home page. React code reads it
 * with useIdea(). Modules outside React (shaders, draw loops) read ideaNow(),
 * which is set while the provider renders so it is in place before any
 * child's effects run.
 */
let current = 0;

export function ideaNow(): number {
  return current;
}

const IdeaContext = createContext(0);

export function useIdea(): number {
  return useContext(IdeaContext);
}

export function IdeaProvider({ n, children }: { n: number; children: ReactNode }): JSX.Element {
  if (typeof window !== "undefined") current = n;
  useEffect(() => {
    current = n;
    return () => {
      current = 0;
    };
  }, [n]);
  return <IdeaContext.Provider value={n}>{children}</IdeaContext.Provider>;
}
