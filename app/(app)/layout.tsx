import { cookies } from "next/headers";

import { AppSidebar } from "@/components/shell/AppSidebar";
import { AppTopbar } from "@/components/shell/AppTopbar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

/*
  App shell (Step 3.6). Every Step 4+ page renders inside this: collapsible
  sidebar + slim top bar. The open/collapsed state persists in the `sidebar_state`
  cookie (written client-side by the Sidebar primitive on toggle); we read it here
  so the server render matches the user's last choice and there's no flash.
*/
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar />
      <SidebarInset>
        <AppTopbar />
        <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-8">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
