import { DeletedTimesScreen } from "@/components/audit/DeletedTimesScreen";

// Coach-only record of deleted results (§R17, Part C). Viewers are barred by
// route scoping and by requireCoach in api.audit.listDeletedTimeLog.
export default function DeletedTimesPage() {
  return <DeletedTimesScreen />;
}
