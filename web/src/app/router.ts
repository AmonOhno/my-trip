import { useSyncExternalStore } from "react";

export type Route =
  | { name: "home" }
  | { name: "recording" }
  | { name: "trips" }
  | { name: "trip"; id: string }
  | { name: "settings" };

function parse(hash: string): Route {
  const path = hash.replace(/^#/, "");
  if (path === "/recording") return { name: "recording" };
  if (path === "/trips") return { name: "trips" };
  if (path === "/settings") return { name: "settings" };
  const m = /^\/trips\/([^/]+)$/.exec(path);
  if (m) return { name: "trip", id: m[1] };
  return { name: "home" };
}

function subscribe(cb: () => void): () => void {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return parse(hash);
}

export function navigate(path: string): void {
  window.location.hash = path;
}
