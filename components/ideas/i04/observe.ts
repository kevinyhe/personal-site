/** Two shared IntersectionObservers for idea 4: "entered" once an element is
 *  above the screen's bottom 10%, "present" while any of it is on screen. */

export type Sighting = { entered: boolean; present: boolean };

type Watcher = { sighting: Sighting; onChange: () => void };

export function createObserver(): { watch: (el: Element, onChange: () => void) => Sighting; stop: () => void } {
  const watchers = new Map<Element, Watcher>();
  const update = (key: keyof Sighting) => (entries: IntersectionObserverEntry[]) => {
    for (const entry of entries) {
      const watcher = watchers.get(entry.target);
      if (!watcher) continue;
      watcher.sighting[key] = entry.isIntersecting;
      watcher.onChange();
    }
  };
  const entering = new IntersectionObserver(update("entered"), { rootMargin: "0px 0px -10% 0px" });
  const showing = new IntersectionObserver(update("present"));
  return {
    watch(el, onChange) {
      const sighting: Sighting = { entered: false, present: false };
      watchers.set(el, { sighting, onChange });
      entering.observe(el);
      showing.observe(el);
      return sighting;
    },
    stop() {
      entering.disconnect();
      showing.disconnect();
      watchers.clear();
    },
  };
}
