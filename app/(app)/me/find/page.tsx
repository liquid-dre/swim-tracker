import { PageHeader } from "@/components/ui/PageHeader";
import { FindSwimmerScreen } from "@/components/me/FindSwimmerScreen";
import { ReadOnlyChip } from "@/components/me/viewerShared";

// Find a swimmer (access-control P2). A viewer searches the roster for their own
// swimmer and requests read-only access; the owning club's coach approves. Lives
// under /me so it stays inside the viewer boundary (nav + server-enforced).
export default function FindSwimmerPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Find a swimmer"
        breadcrumb={[{ label: "Overview", href: "/me" }, { label: "Find a swimmer" }]}
        description="Search for your swimmer and request access. Their coach approves it, then their bests appear in your sections."
        actions={<ReadOnlyChip />}
      />
      <FindSwimmerScreen />
    </div>
  );
}
