import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

// Scheduled jobs. Once a day we lapse viewer invites that were never claimed,
// recording an EXPIRED event on the access audit trail (§R17, Part A). Run in the
// small hours (UTC) so it never contends with daytime coach activity.
const crons = cronJobs();

crons.daily(
  "expire stale viewer invites",
  { hourUTC: 3, minuteUTC: 0 },
  internal.audit.expireStaleInvites,
);

export default crons;
