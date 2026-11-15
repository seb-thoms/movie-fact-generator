import { FavoriteMovieForm } from "@/components/favorite-movie-form";
import { SignOutButton } from "@/components/sign-out-button";
import { getFavoriteMovie } from "@/lib/server/movies/favorites";
import { guardAppPage } from "@/lib/server/page-guards";

// The movie page (SPEC §10): set a favorite for the first time, or edit it.
export default async function MoviePage() {
  const user = await guardAppPage("/onboarding");
  const favorite = await getFavoriteMovie(user.id);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-8 p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {favorite ? "Change your favourite movie" : "Set your favourite movie"}
        </h1>
        <SignOutButton />
      </header>
      <p className="text-zinc-600">
        Pick a suggestion, or type any title. The release year is optional.
      </p>
      <FavoriteMovieForm currentMovie={favorite} />
    </main>
  );
}
