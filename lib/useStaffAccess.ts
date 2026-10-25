"use client";

import { isAssistantCoach, isFullStaff } from "./coachLevel";
import { useCurrentProfile } from "./useCurrentProfile";

/**
 * What the signed-in staff member may do, for HIDING controls — the server is
 * the boundary (convex/authz.ts), this only keeps an assistant coach from being
 * offered a button that would be refused.
 *
 *   fullStaff  — Admin or Super Coach: every write a screen offers.
 *   assistant  — Senior / Junior coach: reads the club, writes swimmer notes.
 *
 * Both false while the profile loads, and for a viewer.
 */
export function useStaffAccess(): { fullStaff: boolean; assistant: boolean } {
  const profile = useCurrentProfile();
  if (!profile) return { fullStaff: false, assistant: false };
  return { fullStaff: isFullStaff(profile), assistant: isAssistantCoach(profile) };
}
