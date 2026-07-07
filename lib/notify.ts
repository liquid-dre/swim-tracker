import { ConvexError } from "convex/values";
import { toast } from "sonner";

/*
  The single voice for every action in the app. Import `notify` — never call
  `toast` directly — so copy and theming stay consistent.

  Copy rules (PRODUCT.md: exact, legible, unshowy):
    • success — short, plain, PAST-TENSE ("Swimmer added", "Time saved", "Cut updated").
    • error   — surface the SERVER's message verbatim; it already says what failed.
    • no exclamation spam, no emoji, no motivational filler.
*/

/** Pull a human-readable message out of whatever a mutation threw. */
export function errorMessage(err: unknown, fallback = "Something went wrong"): string {
  // ConvexError first: in production Convex redacts plain Error messages, so the
  // server's own words only survive the trip inside `data`.
  if (err instanceof ConvexError) {
    return typeof err.data === "string" && err.data ? err.data : fallback;
  }
  if (typeof err === "string") return err;
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string" && m) return m;
  }
  return fallback;
}

export const notify = {
  /** A completed action. Keep it short and past-tense: "Time saved". */
  success(message: string) {
    return toast.success(message);
  },

  /** A failure. Pass the server/thrown error or a plain string. */
  error(message: unknown) {
    return toast.error(errorMessage(message));
  },

  /** Neutral, non-blocking context. Use sparingly. */
  info(message: string) {
    return toast.info(message);
  },

  /** Dismiss a toast (or all, if no id is given). */
  dismiss(id?: string | number) {
    return toast.dismiss(id);
  },

  /**
   * Wrap an async action (typically a Convex mutation): shows `loading`, then
   * resolves to `success` or `error`. `success` may be a string or a builder that
   * receives the resolved value; `error` maps the thrown error to a message
   * (defaults to the server's own message).
   */
  promise<T>(
    promise: Promise<T>,
    opts: {
      loading: string;
      success: string | ((data: T) => string);
      error?: string | ((err: unknown) => string);
    },
  ): Promise<T> {
    toast.promise(promise, {
      loading: opts.loading,
      success: (data: T) =>
        typeof opts.success === "function" ? opts.success(data) : opts.success,
      error: (err: unknown) =>
        opts.error === undefined
          ? errorMessage(err)
          : typeof opts.error === "function"
            ? opts.error(err)
            : opts.error,
    });
    // Return the underlying promise so callers can still await the real result.
    return promise;
  },
};
