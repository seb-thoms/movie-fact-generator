// Fact generation constants (SPEC §7.1).

/** A user's delivery younger than this is served again from cache (DB clock). */
export const CACHE_WINDOW_SECONDS = 60;
/** How long a generation lease lasts; must exceed the deadline (see test). */
export const LEASE_TTL_SECONDS = 20;
/** One AbortSignal for OpenAI call + retry + moderation. */
export const GENERATION_DEADLINE_MS = 12_000;
/** A request that lost the lease polls the cache this often, for at most POLL_MAX. */
export const LOST_LEASE_POLL_INTERVAL_MS = 250;
export const LOST_LEASE_POLL_MAX_MS = 2_000;
