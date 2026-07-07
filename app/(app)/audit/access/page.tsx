import { AccessLogScreen } from "@/components/audit/AccessLogScreen";

// Coach-only viewer-access audit trail (§R17, Part A). Access is barred for
// viewers by isRouteAllowed (only /me/* is theirs) and enforced server-side in
// api.audit.listAccessLog (requireCoach).
export default function AccessLogPage() {
  return <AccessLogScreen />;
}
