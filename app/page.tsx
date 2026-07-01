import { redirect } from "next/navigation";

// The app entry point is the dashboard, inside the app shell (Step 3.6).
export default function Home() {
  redirect("/dashboard");
}
