"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { useCurrentProfile } from "@/lib/useCurrentProfile";

// Placeholder home (Step 1.6). Real dashboard arrives in later steps; for now
// it simply proves auth + profile provisioning by showing name and role.
export default function Home() {
  const { signOut } = useAuthActions();
  const router = useRouter();
  const profile = useCurrentProfile();

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-16">
      <div className="space-y-1">
        <p className="text-sm text-zinc-500">Swim Tracker</p>
        {profile === undefined ? (
          <p className="text-zinc-500">Loading…</p>
        ) : profile === null ? (
          <p className="text-zinc-500">No profile found.</p>
        ) : (
          <>
            <h1 className="text-2xl font-semibold">{profile.name}</h1>
            <p className="text-sm text-zinc-600">
              Role: <span className="font-medium">{profile.role}</span>
            </p>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={async () => {
          await signOut();
          router.push("/login");
        }}
        className="w-fit rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100"
      >
        Sign out
      </button>
    </main>
  );
}
