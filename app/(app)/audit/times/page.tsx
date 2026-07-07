import { TimeEntryLogScreen } from "@/components/audit/TimeEntryLogScreen";

// Coach-only time-entry audit trail (§R17, Part B). Viewers are barred by route
// scoping and by requireCoach in api.audit.listTimeEntryLog.
export default function TimeEntryLogPage() {
  return <TimeEntryLogScreen />;
}
