import { BrandShell } from "@/components/BrandShell";
import { getUser } from "@/lib/auth";
import { listUnits, workFor } from "@/lib/content";
import { getProjectForUser } from "@/lib/projects";
import { notFound, redirect } from "next/navigation";

export default async function TodoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getUser();
  if (!user) redirect("/login");
  const project = await getProjectForUser(id, user.id);
  if (!project) notFound();
  if (project.role === "approver") redirect(`/projects/${id}/approve`);
  const items = (await listUnits(id)).flatMap((unit) => workFor(unit, project.role, id));

  return (
    <BrandShell projectId={id} active="todo">
      <h1>Сделать</h1>
      <p className="lead">Ручная публикация, пропущенный слот без «да» и незакрытое «не вышло».</p>
      {items.length === 0 ? <p className="muted">Свободно. Новая работа появится, когда слот попросит человека.</p> : null}
      <div className="list">
        {items.map((item) => (
          <a className="card" key={`${item.kind}-${item.unitId}`} href={item.href}>
            <span>
              <b>{item.title}</b>
              <span>{item.text}</span>
            </span>
            <span>открыть</span>
          </a>
        ))}
      </div>
    </BrandShell>
  );
}
