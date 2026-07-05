import { redirect } from "next/navigation";

// The viewer home is the My swimmers list. `/me` redirects there so the old
// landing URL, and homeForRole's post-login redirect, both resolve cleanly.
export default function MePage() {
  redirect("/me/swimmers");
}
