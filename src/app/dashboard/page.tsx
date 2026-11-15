import Link from "next/link";

import { Avatar } from "@/components/avatar";
import { FactPanel } from "@/components/fact-panel";
import { SignOutButton } from "@/components/sign-out-button";
import { getFavoriteMovie } from "@/lib/server/movies/favorites";
import { guardAppPage } from "@/lib/server/page-guards";
import { formatMovie } from "@/lib/shared/movies";

// Dashboard (SPEC §11): profile, favorite movie, and its fun fact.
export default async function DashboardPage() {
  const user = await guardAppPage("/dashboard");
  const favorite = await getFavoriteMovie(user.id);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-8 p-8">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Avatar name={user.name} image={user.image} />
          <div>
            <h1 className="text-2xl font-semibold">Hey {user.name}</h1>
            <p className="text-sm text-zinc-500">{user.email}</p>
          </div>
        </div>
        <SignOutButton />
      </header>

      {favorite ? (
        <>
          <section aria-labelledby="favorite-heading" className="flex flex-col gap-2">
            <h2 id="favorite-heading" className="text-sm font-medium uppercase text-zinc-500">
              Your favourite movie is
            </h2>
            <div className="flex items-baseline gap-4">
              <p className="text-xl font-semibold">{formatMovie(favorite)}</p>
              <Link href="/onboarding" className="text-sm text-zinc-600 underline">
                Edit
              </Link>
            </div>
          </section>

          <section aria-labelledby="fact-heading" className="flex flex-col gap-2">
            <h2 id="fact-heading" className="text-sm font-medium uppercase text-zinc-500">
              Here&apos;s a fun fact
            </h2>
            {/* key: a new favorite remounts the panel and fetches its fact. */}
            <FactPanel key={favorite.id} movieId={favorite.id} movieLabel={formatMovie(favorite)} />
          </section>
        </>
      ) : (
        <section className="flex flex-col items-start gap-4">
          <p className="text-lg">No favourite movie set</p>
          <Link
            href="/onboarding"
            className="rounded-full bg-zinc-900 px-6 py-3 font-medium text-white hover:bg-zinc-700"
          >
            Set movie
          </Link>
        </section>
      )}
    </main>
  );
}
