import { MeetsScreen } from "@/components/meets/MeetsScreen";

// The season's fixtures (§R19). `today` is resolved once on the server so
// "upcoming" doesn't depend on an impure render clock. Reading is open to every
// signed-in role; only the SUPER_USER sees (and may use) the editing controls,
// which convex/meets.ts enforces regardless.
export default async function MeetsPage() {
  const today = new Date().toISOString().slice(0, 10);
  return <MeetsScreen role="coach" today={today} />;
}
