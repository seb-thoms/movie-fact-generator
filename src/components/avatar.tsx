import { initialsFor } from "@/lib/shared/initials";

/**
 * Profile photo, or an initials circle when the user has none (SPEC §11).
 * Decorative (alt=""): the user's name is shown right next to it.
 */
export function Avatar({ name, image }: { name: string; image: string | null }) {
  if (image) {
    return (
      // A plain <img>, not next/image: next/image throws for image hosts that
      // aren't configured, and Google photos can come from varying hosts.
      // no-referrer: Google's image servers may reject requests with a referrer.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt=""
        width={48}
        height={48}
        referrerPolicy="no-referrer"
        className="h-12 w-12 rounded-full object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-200 font-semibold text-zinc-700"
    >
      {initialsFor(name)}
    </span>
  );
}
