"use client";

import { useEffect, useState } from "react";
import {
  TREE_TUNING_DEFAULT,
  TREE_TUNING_STORAGE_KEY,
  type TreeTuning,
  freezeBlock,
  isTreeTuningEnabled,
  setTreeTuning,
} from "@/components/treeTuning";

/**
 * Live tree placement controls. Mounts only when the URL carries ?tune, so an
 * ordinary visit never sees it and nothing about the shipped page changes.
 *
 * Visit /?tune, drag until the tree sits where you want it, then hit Freeze:
 * it copies the exact lines to paste into generate(). Settings persist in
 * localStorage so a reload does not lose them.
 */
type Field = {
  key: keyof TreeTuning;
  label: string;
  min: number;
  max: number;
  step: number;
};

const FIELDS: Field[] = [
  { key: "x", label: "across", min: -6, max: 10, step: 0.05 },
  { key: "y", label: "up", min: -6, max: 8, step: 0.05 },
  { key: "z", label: "depth", min: -10, max: 9, step: 0.05 },
  // +-3.14 rather than +-Math.PI: a range input snaps its value to
  // min + n*step, and with min = -3.14159... no n lands on exactly 0, so the
  // spin slider reads -0.0016 at rest instead of zero.
  { key: "rotY", label: "spin", min: -3.14, max: 3.14, step: 0.01 },
  { key: "scale", label: "size", min: 0.4, max: 2, step: 0.01 },
];

export default function TreeTuner() {
  const [on, setOn] = useState(false);
  const [t, setT] = useState<TreeTuning>(TREE_TUNING_DEFAULT);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    if (!isTreeTuningEnabled()) return;
    setOn(true);
    try {
      const saved = window.localStorage.getItem(TREE_TUNING_STORAGE_KEY);
      if (saved) {
        const parsed = { ...TREE_TUNING_DEFAULT, ...JSON.parse(saved) };
        setT(parsed);
        setTreeTuning(parsed);
      }
    } catch {
      // A malformed entry should not take the page down; defaults are fine.
    }
  }, []);

  const update = (key: keyof TreeTuning, value: number) => {
    const next = { ...t, [key]: value };
    setT(next);
    setTreeTuning(next);
    try {
      window.localStorage.setItem(
        TREE_TUNING_STORAGE_KEY,
        JSON.stringify(next),
      );
    } catch {
      // Private browsing — tuning still works, it just will not persist.
    }
  };

  const reset = () => {
    setT(TREE_TUNING_DEFAULT);
    setTreeTuning(TREE_TUNING_DEFAULT);
    try {
      window.localStorage.removeItem(TREE_TUNING_STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  const freeze = () => {
    const block = freezeBlock(t);
    // Console too: clipboard writes are blocked in some contexts and the
    // whole point of this button is that the values reach you intact.
    console.log("[tree freeze]\n" + block);
    navigator.clipboard?.writeText(block).then(
      () => setCopied("copied to clipboard + console"),
      () => setCopied("in the console (clipboard blocked)"),
    );
  };

  if (!on) return null;

  return (
    <div className="fixed bottom-4 left-4 z-[200] w-[268px] rounded-md border border-white/15 bg-black/85 p-3 font-mono text-[11px] text-[#f0f0f0] backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <span className="tracking-wide text-white/60">TREE PLACEMENT</span>
        <button
          className="rounded border border-white/20 px-1.5 py-0.5 text-white/60 hover:text-white"
          onClick={reset}
          type="button"
        >
          reset
        </button>
      </div>

      {FIELDS.map((f) => (
        <label className="mb-1.5 block" key={f.key}>
          <span className="flex justify-between text-white/55">
            <span>{f.label}</span>
            <span className="tabular-nums text-white/80">
              {t[f.key].toFixed(2)}
            </span>
          </span>
          <input
            className="w-full accent-[#ff5f9a]"
            max={f.max}
            min={f.min}
            onChange={(e) => update(f.key, Number(e.target.value))}
            step={f.step}
            type="range"
            value={t[f.key]}
          />
        </label>
      ))}

      <button
        className="mt-1 w-full rounded bg-[#ff5f9a] px-2 py-1.5 font-medium text-black hover:bg-[#ff7dae]"
        onClick={freeze}
        type="button"
      >
        Freeze — copy code
      </button>
      {copied ? (
        <p className="mt-1.5 leading-snug text-white/50">{copied}</p>
      ) : (
        <p className="mt-1.5 leading-snug text-white/40">
          Paste the copied lines back to Claude to bake them in and remove this
          panel.
        </p>
      )}
    </div>
  );
}
