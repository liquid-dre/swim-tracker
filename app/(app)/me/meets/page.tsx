import { MeetsScreen } from "@/components/meets/MeetsScreen";

// The viewer's mirror of /meets (§R19). Read-only: the same fixtures and the
// same programmes, with no editing controls at all. Opted into the viewer nav
// explicitly in lib/nav.ts, which is deny-by-default for /me routes.
export default async function ViewerMeetsPage() {
  const today = new Date().toISOString().slice(0, 10);
  return <MeetsScreen role="viewer" today={today} />;
}
