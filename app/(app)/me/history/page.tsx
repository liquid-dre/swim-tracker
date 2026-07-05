import { redirect } from "next/navigation";

// Old viewer History route. A swimmer's full history now lives on their profile
// (/me/swimmers/[id]); send this to the My swimmers list to pick a swimmer.
export default function ViewerHistoryPage() {
  redirect("/me/swimmers");
}
