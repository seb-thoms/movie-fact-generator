"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useReducer, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { z } from "zod";

import type { ApiErrorBody, MovieSearchResponse, MovieSearchResult } from "@/lib/shared/api";
import { formatMovie } from "@/lib/shared/movies";
import { favoriteMovieInputSchema, maxReleaseYear } from "@/lib/shared/schemas";

import {
  activeOption,
  comboboxReducer,
  initialComboboxState,
  shouldSearch,
} from "./combobox-state";

const SEARCH_DEBOUNCE_MS = 250;
const LISTBOX_ID = "movie-suggestions";
const optionId = (index: number) => `movie-option-${index}`;

type FieldErrors = { title?: string[]; releaseYear?: string[] };
type Props = {
  /** The current favorite when editing; the fields start with its values. */
  currentMovie?: { title: string; releaseYear: number | null } | null;
};

/**
 * The movie page form (SPEC §10). Title is required; year is optional. The
 * title field is a WAI-ARIA combobox suggesting verified movies; picking one
 * fills title and year. Saves with PUT /api/me/favorite-movie (set or edit).
 */
export function FavoriteMovieForm({ currentMovie }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(currentMovie?.title ?? "");
  const [year, setYear] = useState(currentMovie?.releaseYear?.toString() ?? "");
  const [combobox, dispatch] = useReducer(comboboxReducer, initialComboboxState);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [failed, setFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Skip searching for titles we set ourselves (a picked suggestion, or the
  // pre-filled current favorite); only typing should open suggestions.
  const skipNextSearch = useRef(Boolean(currentMovie));

  // Debounced search: wait 250 ms after typing stops; cancel stale requests.
  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }
    if (!shouldSearch(title)) {
      dispatch({ type: "optionsLoaded", options: [] });
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/movies/search?q=${encodeURIComponent(title)}`, {
          signal: controller.signal,
        });
        if (!response.ok) return; // Suggestions are optional; free entry still works.
        const body = (await response.json()) as MovieSearchResponse;
        dispatch({ type: "optionsLoaded", options: body.movies });
      } catch {
        // Aborted or offline: keep the form usable without suggestions.
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [title]);

  function selectOption(option: MovieSearchResult) {
    skipNextSearch.current = true;
    setTitle(option.title);
    setYear(option.releaseYear?.toString() ?? "");
    setFieldErrors({});
    dispatch({ type: "selected" });
  }

  function onTitleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      dispatch({ type: event.key === "ArrowDown" ? "arrowDown" : "arrowUp" });
    } else if (event.key === "Enter") {
      const option = activeOption(combobox);
      if (option) {
        event.preventDefault(); // pick the suggestion instead of submitting
        selectOption(option);
      }
    } else if (event.key === "Escape") {
      dispatch({ type: "escape" });
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFailed(false);

    // Same rules as the server (shared schema), for instant feedback.
    const input = { title, releaseYear: year.trim() === "" ? null : Number(year) };
    const parsed = favoriteMovieInputSchema.safeParse(input);
    if (!parsed.success) {
      setFieldErrors(z.flattenError(parsed.error).fieldErrors);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);

    try {
      const response = await fetch("/api/me/favorite-movie", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (response.ok) {
        router.replace("/dashboard");
        router.refresh();
        return;
      }
      const body = (await response.json()) as ApiErrorBody;
      if (body.error.code === "VALIDATION_ERROR") {
        setFieldErrors(body.error.details?.fieldErrors ?? {});
      } else {
        setFailed(true);
      }
    } catch {
      setFailed(true);
    }
    setSubmitting(false);
  }

  const activeIndex = combobox.open ? combobox.activeIndex : -1;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <div className="relative flex flex-col gap-1">
        <label htmlFor="movie-title" className="font-medium">
          Movie title
        </label>
        <input
          id="movie-title"
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={combobox.open}
          aria-controls={LISTBOX_ID}
          aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
          aria-required
          aria-invalid={fieldErrors.title ? true : undefined}
          aria-describedby={fieldErrors.title ? "movie-title-error" : undefined}
          autoComplete="off"
          maxLength={100}
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            dispatch({ type: "inputChanged" });
          }}
          onKeyDown={onTitleKeyDown}
          onBlur={() => dispatch({ type: "escape" })}
          className="rounded-lg border border-zinc-300 px-3 py-2"
          placeholder="e.g. Dune"
        />
        <ul
          id={LISTBOX_ID}
          role="listbox"
          aria-label="Movie suggestions"
          hidden={!combobox.open}
          className="absolute top-full z-10 mt-1 w-full overflow-hidden rounded-lg border border-zinc-200 bg-white shadow"
        >
          {combobox.options.map((option, index) => (
            <li
              key={option.id}
              id={optionId(index)}
              role="option"
              aria-selected={index === activeIndex}
              // mousedown (not click) so the input's blur doesn't close the list first
              onMouseDown={(event) => {
                event.preventDefault();
                selectOption(option);
              }}
              className={`cursor-pointer px-3 py-2 ${index === activeIndex ? "bg-zinc-100" : ""}`}
            >
              {formatMovie(option)}
            </li>
          ))}
        </ul>
        {fieldErrors.title && (
          <p id="movie-title-error" className="text-sm text-red-700">
            {fieldErrors.title[0]}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="movie-year" className="font-medium">
          Release year <span className="font-normal text-zinc-500">(optional)</span>
        </label>
        <input
          id="movie-year"
          type="number"
          inputMode="numeric"
          min={1888}
          max={maxReleaseYear()}
          value={year}
          onChange={(event) => setYear(event.target.value)}
          aria-invalid={fieldErrors.releaseYear ? true : undefined}
          aria-describedby={fieldErrors.releaseYear ? "movie-year-error" : undefined}
          className="w-32 rounded-lg border border-zinc-300 px-3 py-2"
          placeholder="2021"
        />
        {fieldErrors.releaseYear && (
          <p id="movie-year-error" className="text-sm text-red-700">
            {fieldErrors.releaseYear[0]}
          </p>
        )}
      </div>

      {failed && (
        <p role="alert" className="text-sm text-red-700">
          Something went wrong. Please try again.
        </p>
      )}

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-zinc-900 px-6 py-3 font-medium text-white hover:bg-zinc-700 disabled:opacity-60"
        >
          {submitting ? "Saving…" : "Save"}
        </button>
        {currentMovie && (
          <Link href="/dashboard" className="text-sm text-zinc-600 underline">
            Cancel
          </Link>
        )}
      </div>
    </form>
  );
}
