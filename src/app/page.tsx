import { SignInButton } from "@/components/sign-in-button";
import { guardLandingPage } from "@/lib/server/page-guards";

type LandingPageProps = { searchParams: Promise<{ error?: string | string[] }> };

export default async function LandingPage({ searchParams }: LandingPageProps) {
  // Signed-in users are redirected to onboarding or the dashboard (SPEC §5).
  await guardLandingPage();
  // Better Auth sends users back here with ?error=… if Google sign-in fails.
  const { error } = await searchParams;

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-semibold">Movie Memory</h1>
      <p className="max-w-md text-lg text-zinc-600">
        Tell us your favorite movie and get a fun fact about it every time you visit.
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          Sign-in didn&apos;t complete. Please try again.
        </p>
      )}
      <SignInButton />
    </main>
  );
}
