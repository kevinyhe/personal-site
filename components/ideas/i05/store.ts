import { useSyncExternalStore } from "react";

/** Idea 5: which Work row is under the pointer and which is open as a case
 *  study, shared by the rows (WorkIndex.tsx) and the overlay (Extra.tsx). */

export type WorkState = { hovered: number | null; opened: number | null };

const CLOSED: WorkState = { hovered: null, opened: null };
let state: WorkState = CLOSED;
let opener: HTMLElement | null = null;
const listeners = new Set<() => void>();

function update(next: Partial<WorkState>): void {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

export function hoverRow(index: number | null): void {
  if (state.hovered !== index) update({ hovered: index });
}

export function openRow(index: number, from: HTMLElement): void {
  opener = from;
  update({ opened: index, hovered: null });
}

/** Called once the panel has wiped itself away; focus goes back to the row. */
export function closeRow(): void {
  update({ opened: null });
  opener?.focus({ preventScroll: true });
  opener = null;
}

export function subscribeWork(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function workState(): WorkState {
  return state;
}

export function useWorkState(): WorkState {
  return useSyncExternalStore(subscribeWork, workState, () => CLOSED);
}
