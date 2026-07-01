import { StandardsScreen } from "@/components/standards/StandardsScreen";

// Coach-only qualifying-standards editor (Step 9, BRD §5.8). The screen and
// every query/mutation behind it are gated to coaches server-side.
export default function StandardsPage() {
  return <StandardsScreen />;
}
