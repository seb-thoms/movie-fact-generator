import { describe, expect, it } from "vitest";

import {
  activeOption,
  comboboxReducer,
  initialComboboxState,
  shouldSearch,
  type ComboboxState,
} from "@/components/combobox-state";

const options = [
  { id: "1", title: "Dune", releaseYear: 1984 },
  { id: "2", title: "Dune", releaseYear: 2021 },
  { id: "3", title: "Dunkirk", releaseYear: 2017 },
];

function loaded(): ComboboxState {
  return comboboxReducer(initialComboboxState, { type: "optionsLoaded", options });
}

function press(state: ComboboxState, ...keys: ("arrowDown" | "arrowUp")[]) {
  return keys.reduce((s, type) => comboboxReducer(s, { type }), state);
}

describe("combobox state (WAI-ARIA combobox pattern, SPEC §10)", () => {
  it("starts closed with no active option", () => {
    expect(initialComboboxState).toEqual({ open: false, activeIndex: -1, options: [] });
  });

  it("opens when suggestions arrive, with nothing highlighted yet", () => {
    expect(loaded()).toMatchObject({ open: true, activeIndex: -1 });
  });

  it("stays closed when there are no suggestions", () => {
    const state = comboboxReducer(initialComboboxState, { type: "optionsLoaded", options: [] });

    expect(state.open).toBe(false);
  });

  it("ArrowDown moves through the options and wraps to the first", () => {
    expect(press(loaded(), "arrowDown").activeIndex).toBe(0);
    expect(press(loaded(), "arrowDown", "arrowDown", "arrowDown").activeIndex).toBe(2);
    expect(press(loaded(), "arrowDown", "arrowDown", "arrowDown", "arrowDown").activeIndex).toBe(0);
  });

  it("ArrowUp moves backwards and wraps to the last", () => {
    expect(press(loaded(), "arrowUp").activeIndex).toBe(2);
    expect(press(loaded(), "arrowDown", "arrowDown", "arrowUp").activeIndex).toBe(0);
  });

  it("ArrowDown reopens a closed list that still has suggestions", () => {
    const closed = comboboxReducer(loaded(), { type: "escape" });

    expect(press(closed, "arrowDown")).toMatchObject({ open: true, activeIndex: 0 });
  });

  it("arrow keys do nothing when there are no suggestions", () => {
    expect(press(initialComboboxState, "arrowDown", "arrowUp")).toEqual(initialComboboxState);
  });

  it("Escape closes the list", () => {
    expect(comboboxReducer(press(loaded(), "arrowDown"), { type: "escape" })).toMatchObject({
      open: false,
      activeIndex: -1,
    });
  });

  it("typing clears the highlighted option", () => {
    const typed = comboboxReducer(press(loaded(), "arrowDown"), { type: "inputChanged" });

    expect(typed.activeIndex).toBe(-1);
  });

  it("selecting closes the list", () => {
    expect(comboboxReducer(press(loaded(), "arrowDown"), { type: "selected" })).toMatchObject({
      open: false,
      activeIndex: -1,
    });
  });

  it("activeOption returns the highlighted suggestion (for Enter to select)", () => {
    expect(activeOption(press(loaded(), "arrowDown", "arrowDown"))).toEqual(options[1]);
    expect(activeOption(loaded())).toBeUndefined();
  });
});

describe("shouldSearch (SPEC §10: search after at least 2 typed characters)", () => {
  it.each([
    ["d", false],
    ["du", true],
    ["a!", false],
    ["  é ", false],
    ["Dune", true],
    ["a".repeat(101), false],
  ])("%j → %s", (query, expected) => {
    expect(shouldSearch(query)).toBe(expected);
  });
});
