import "@testing-library/jest-dom/vitest";

class MatchMediaMock {
  matches = false;
  readonly media: string;
  onchange: ((this: MediaQueryList, event: MediaQueryListEvent) => unknown) | null = null;
  private readonly legacyListeners = new Set<(event: MediaQueryListEvent) => void>();
  private readonly listeners = new Set<EventListenerOrEventListenerObject>();

  constructor(media: string) {
    this.media = media;
  }

  addListener(listener: (event: MediaQueryListEvent) => void) {
    this.legacyListeners.add(listener);
  }

  removeListener(listener: (event: MediaQueryListEvent) => void) {
    this.legacyListeners.delete(listener);
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject | null) {
    if (type !== "change" || !listener) return;
    this.listeners.add(listener);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null) {
    if (type !== "change" || !listener) return;
    this.listeners.delete(listener);
  }

  dispatchEvent(event: Event) {
    if (event.type !== "change") return true;
    for (const listener of this.listeners) {
      if (typeof listener === "function") listener(event);
      else listener.handleEvent(event);
    }
    return true;
  }

  setMatches(matches: boolean) {
    if (this.matches === matches) return;
    this.matches = matches;
    const event = { matches, media: this.media, type: "change" } as MediaQueryListEvent;
    this.onchange?.call(this as unknown as MediaQueryList, event);
    for (const listener of this.legacyListeners) listener(event);
    this.dispatchEvent(event as unknown as Event);
  }
}

const mediaQueries = new Map<string, MatchMediaMock>();

export function setMediaQueryMatches(query: string, matches: boolean) {
  getMediaQuery(query).setMatches(matches);
}

export function resetMediaQueries() {
  for (const mediaQuery of mediaQueries.values()) mediaQuery.setMatches(false);
}

function getMediaQuery(query: string) {
  const existing = mediaQueries.get(query);
  if (existing) return existing;
  const created = new MatchMediaMock(query);
  mediaQueries.set(query, created);
  return created;
}

if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => getMediaQuery(query) as unknown as MediaQueryList
  });
}
