import { SignOutButton } from "@/components/sign-out-button";
import { guardAppPage } from "@/lib/server/page-guards";

// Placeholder: step 7 adds the profile, favorite movie, and fact panel (SPEC §11).
export default async function DashboardPage() {
  const user = await guardAppPage("/dashboard");

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Hey {user.name}</h1>
        <SignOutButton />
      </header>
    </main>
  );
}
