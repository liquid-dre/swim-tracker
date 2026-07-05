import { redirect } from "next/navigation";

// Old viewer Progress route. Progression is now its own coach-style screen at
// /me/progression; redirect so existing links/bookmarks still land.
export default function ViewerProgressPage() {
  redirect("/me/progression");
}
