// State for the movie autocomplete, following the WAI-ARIA combobox pattern
// (SPEC §10). A pure reducer, so keyboard behavior is unit-tested without a
// browser; the component only maps keys and clicks to actions.
import type { MovieSearchResult } from "@/lib/shared/api";
import { normalizeTitle } from "@/lib/shared/movies";

export type ComboboxState = {
  open: boolean;
  /** Highlighted option, or -1 for none (what aria-activedescendant points at). */
  activeIndex: number;
  options: MovieSearchResult[];
};

export type ComboboxAction =
  | { type: "optionsLoaded"; options: MovieSearchResult[] }
  | { type: "arrowDown" }
  | { type: "arrowUp" }
  | { type: "escape" }
  | { type: "inputChanged" }
  | { type: "selected" };

export const initialComboboxState: ComboboxState = { open: false, activeIndex: -1, options: [] };

export function comboboxReducer(state: ComboboxState, action: ComboboxAction): ComboboxState {
  const count = state.options.length;
  switch (action.type) {
    case "optionsLoaded":
      return { open: action.options.length > 0, activeIndex: -1, options: action.options };
    case "arrowDown":
      if (count === 0) return state;
      if (!state.open) return { ...state, open: true, activeIndex: 0 };
      return { ...state, activeIndex: (state.activeIndex + 1) % count };
    case "arrowUp":
      if (count === 0) return state;
      if (!state.open || state.activeIndex <= 0)
        return { ...state, open: true, activeIndex: count - 1 };
      return { ...state, activeIndex: state.activeIndex - 1 };
    case "inputChanged":
      return { ...state, activeIndex: -1 };
    case "escape":
    case "selected":
      return { ...state, open: false, activeIndex: -1 };
  }
}

export function activeOption(state: ComboboxState): MovieSearchResult | undefined {
  return state.open ? state.options[state.activeIndex] : undefined;
}

/** Mirrors the server's q rule (SPEC §4.2), so we never send a request that would 422. */
export function shouldSearch(query: string): boolean {
  return query.length <= 100 && normalizeTitle(query).length >= 2;
}
