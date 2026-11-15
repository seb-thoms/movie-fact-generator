import { describe, expect, it } from "vitest";

import { isDeleteConfirmed } from "@/components/delete-confirmation";

describe("isDeleteConfirmed (the Delete button unlocks only for exactly 'delete', SPEC §11)", () => {
  it("accepts exactly 'delete'", () => {
    expect(isDeleteConfirmed("delete")).toBe(true);
  });

  it.each(["", "Delete", "DELETE", " delete", "delete ", "delet", "deletee"])(
    "rejects %j (the server would answer 400)",
    (text) => {
      expect(isDeleteConfirmed(text)).toBe(false);
    },
  );
});
