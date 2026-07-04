import { SwimmersScreen } from "@/components/swimmers/SwimmersScreen";

// My swimmers — the coach's own-club roster (their edit scope), as opposed to
// the full cross-club Roster at /swimmers. Scoped server-side via
// listSwimmers({ myClubOnly: true }). `today` is resolved once per request so the
// client form's live age + date bounds don't depend on an impure render clock.
export default function MySwimmersPage() {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <SwimmersScreen
      today={today}
      myClubOnly
      title="My swimmers"
      href="/my-swimmers"
    />
  );
}
