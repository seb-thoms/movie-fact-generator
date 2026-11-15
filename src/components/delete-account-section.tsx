"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { isDeleteConfirmed } from "./delete-confirmation";

/**
 * Danger zone (SPEC §11, §12): deleting the account requires typing "delete".
 * The server checks the same rule; this check only enables the button.
 */
export function DeleteAccountSection() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [failed, setFailed] = useState(false);

  async function deleteAccount() {
    setDeleting(true);
    setFailed(false);
    try {
      const response = await fetch("/api/me", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: text }),
      });
      if (response.status === 204) {
        router.replace("/");
        router.refresh();
        return;
      }
    } catch {
      // Network error: fall through to the message; the account still exists.
    }
    setFailed(true);
    setDeleting(false);
  }

  function cancel() {
    setOpen(false);
    setText("");
    setFailed(false);
  }

  return (
    <section
      aria-labelledby="danger-heading"
      className="mt-8 flex flex-col gap-3 rounded-lg border border-red-200 p-4"
    >
      <h2 id="danger-heading" className="text-sm font-medium uppercase text-red-700">
        Danger zone
      </h2>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="self-start rounded-full border border-red-300 px-4 py-2 text-sm text-red-700 hover:bg-red-50"
        >
          Delete account
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          <p id="delete-warning" className="text-sm text-zinc-700">
            This permanently deletes your account, your favourite movie, and your fact history, and
            signs you out everywhere. It can&apos;t be undone.
          </p>
          <label htmlFor="delete-confirm" className="text-sm font-medium">
            Type <span className="font-mono">delete</span> to confirm
          </label>
          <input
            id="delete-confirm"
            type="text"
            autoComplete="off"
            autoFocus
            value={text}
            onChange={(event) => setText(event.target.value)}
            aria-describedby="delete-warning"
            className="w-48 rounded-lg border border-zinc-300 px-3 py-2 font-mono"
          />
          {failed && (
            <p role="alert" className="text-sm text-red-700">
              We couldn&apos;t delete your account. Please try again.
            </p>
          )}
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={deleteAccount}
              disabled={!isDeleteConfirmed(text) || deleting}
              className="rounded-full bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete permanently"}
            </button>
            <button type="button" onClick={cancel} className="text-sm text-zinc-600 underline">
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
