"use client";

import { useState } from "react";

import { authClient } from "@/lib/auth-client";

export function SignInButton() {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signIn() {
    setPending(true);
    setFailed(false);
    // On success the browser leaves for Google, then comes back to "/", which
    // redirects to onboarding or the dashboard (SPEC §5).
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: "/",
      errorCallbackURL: "/",
    });
    if (error) {
      setPending(false);
      setFailed(true);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={signIn}
        disabled={pending}
        className="rounded-full bg-zinc-900 px-6 py-3 font-medium text-white hover:bg-zinc-700 disabled:opacity-60"
      >
        {pending ? "Redirecting to Google…" : "Sign in with Google"}
      </button>
      {failed && (
        <p role="alert" className="text-sm text-red-700">
          We couldn&apos;t start sign-in. Please try again.
        </p>
      )}
    </div>
  );
}
