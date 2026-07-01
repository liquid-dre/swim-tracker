"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

/**
 * The signed-in user's profile.
 *  - `undefined` while the query is loading
 *  - `null` when signed out / not yet provisioned
 *  - the profile document otherwise
 */
export function useCurrentProfile() {
  return useQuery(api.profiles.getCurrentProfile);
}
