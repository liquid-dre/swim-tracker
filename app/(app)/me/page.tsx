import { ViewerHomeScreen } from "@/components/me/ViewerHomeScreen";

// Viewer home (Step 15, BRD §5.9). A linked viewer's read-only window onto their
// own swimmer(s): personal bests, progression with their qualifying lines, and
// road-to-qualify. Coaches are redirected away by the shell's RoleGuard; every
// read is scoped to the linked swimmer(s) server-side regardless.
export default function ViewerHomePage() {
  return <ViewerHomeScreen />;
}
