import { CalendarBoard, calendarQuery } from "@/components/CalendarBoard";
import { BrandShell } from "@/components/BrandShell";
import { getUser } from "@/lib/auth";
import { listAccounts, listUnits } from "@/lib/content";
import { getProjectForUser, listMembers } from "@/lib/projects";
import { notFound, redirect } from "next/navigation";

export default async function ProjectCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; view?: string; from?: string; month?: string; unit?: string }>;
}) {
  const { id } = await params;
  const search = await searchParams;
  const user = await getUser();
  if (!user) redirect("/login");
  const project = await getProjectForUser(id, user.id);
  if (!project) notFound();
  if (project.role === "approver") redirect(`/projects/${id}/approve`);
  const [units, accounts, members] = await Promise.all([listUnits(id), listAccounts(id), listMembers(id)]);
  const { view, from, month } = calendarQuery(search);
  const approver = members.find((member) => member.role === "approver");

  return (
    <BrandShell projectId={id} active="calendar">
      <CalendarBoard
        projectId={id}
        units={units}
        accounts={accounts}
        approverName={approver?.name}
        role={project.role}
        view={view}
        from={from}
        month={month}
        selectedId={search.unit}
        error={search.error}
      />
    </BrandShell>
  );
}
