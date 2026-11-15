import { SignOutButton } from "@/components/sign-out-button";
import { guardAppPage } from "@/lib/server/page-guards";

// Placeholder: step 5 adds the favorite-movie form with autocomplete (SPEC §10).
export default async function OnboardingPage() {
  const user = await guardAppPage("/onboarding");

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Welcome, {user.name}</h1>
        <SignOutButton />
      </header>
      <p className="text-zinc-600">Pick your favorite movie to get started.</p>
    </main>
  );
}
