"use client";

import { useEffect, useRef } from "react";
import { useConvexAuth, useMutation } from "convex/react";

import { api } from "@/convex/_generated/api";
import { notify } from "@/lib/notify";
import { takeCoachInvite } from "@/lib/coachInvite";

/*
  Redeems a stashed coach invite (access-control P0) once the Convex session is
  definitively live. Mounted in the authenticated app shell, it waits for
  useConvexAuth().isAuthenticated — which is true only when the client holds a
  valid auth token — before calling redeemCoachInvite, so the redemption can
  never fire before it would succeed. On success the profile's role flips to
  COACH reactively and RoleGuard moves them into the coach area; this component
  only shows the confirmation. Renders nothing.
*/
export function InviteRedeemer() {
  const { isAuthenticated } = useConvexAuth();
  const redeemCoachInvite = useMutation(api.clubs.redeemCoachInvite);
  const handled = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || handled.current) return;
    const token = takeCoachInvite(); // reads AND clears — single attempt
    if (!token) return;
    handled.current = true;
    redeemCoachInvite({ token })
      .then((res) => notify.success(`You're now a coach of ${res.clubName}.`))
      .catch((err) => notify.error(err));
  }, [isAuthenticated, redeemCoachInvite]);

  return null;
}
