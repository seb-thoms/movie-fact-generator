"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { toFactView, type FactView } from "./fact-view";

/** Fetches the fact and maps the response to a panel state (see fact-view.ts). */
async function fetchFactView(movieId: string, signal?: AbortSignal): Promise<FactView> {
  try {
    const response = await fetch(`/api/movies/${encodeURIComponent(movieId)}/fact`, { signal });
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // Not JSON (e.g. a proxy error page): toFactView treats it as unavailable.
    }
    return toFactView(response.status, body);
  } catch {
    return { kind: "unavailable" }; // offline or aborted
  }
}

/**
 * "Here's a fun fact" (SPEC §11). Loads on mount; each visit gets the cached
 * fact within 60 s, otherwise a new one. The fact is model output, so it's
 * rendered as plain text (React escapes it; never dangerouslySetInnerHTML).
 */
export function FactPanel({ movieId, movieLabel }: { movieId: string; movieLabel: string }) {
  const router = useRouter();
  const [view, setView] = useState<FactView>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    void fetchFactView(movieId, controller.signal).then((next) => {
      if (!controller.signal.aborted) setView(next);
    });
    return () => controller.abort();
  }, [movieId]);

  useEffect(() => {
    if (view.kind === "signedOut") router.replace("/");
    // The favorite changed elsewhere: re-render the dashboard with the new one.
    if (view.kind === "favoriteChanged") router.refresh();
  }, [view.kind, router]);

  async function retry() {
    setView({ kind: "loading" });
    setView(await fetchFactView(movieId));
  }

  return (
    <div aria-live="polite" className="flex flex-col gap-2">
      {view.kind === "fact" && (
        <>
          <p className="text-lg leading-relaxed">{view.content}</p>
          {view.stale && (
            <p className="text-sm text-zinc-500">
              Couldn&apos;t fetch a new fact, showing an earlier one.
            </p>
          )}
        </>
      )}
      {view.kind === "notRecognized" && (
        <p className="text-zinc-600">
          We couldn&apos;t find any facts about <em>{movieLabel}</em>.
        </p>
      )}
      {view.kind === "unavailable" && (
        <div className="flex flex-col items-start gap-3">
          <p className="text-zinc-600">We couldn&apos;t get a fun fact right now.</p>
          <button
            type="button"
            onClick={retry}
            className="rounded-full border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100"
          >
            Try again
          </button>
        </div>
      )}
      {(view.kind === "loading" ||
        view.kind === "signedOut" ||
        view.kind === "favoriteChanged") && <p className="text-zinc-500">Fetching a fun fact…</p>}
    </div>
  );
}
