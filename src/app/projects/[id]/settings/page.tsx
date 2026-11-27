import { deleteProjectAction, renameProjectAction } from "@/app/resource-actions";
import { Shell } from "@/components/Shell";
import { getUser } from "@/lib/auth";
import { deletionImpact, isResourceId } from "@/lib/project-resources";
import { getProjectForUser } from "@/lib/projects";
import { notFound, redirect } from "next/navigation";

export default async function ProjectSettings({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const user = await getUser();
  if (!user) redirect("/login");
  if (!isResourceId(id)) notFound();
  const project = await getProjectForUser(id, user.id);
  if (!project || project.role !== "owner") notFound();
  const impact = await deletionImpact(id);
  return (
    <Shell>
      <a href="/projects">Все проекты</a>
      <h1>Настройки проекта «{project.name}»</h1>
      <p className="actions">
        <a href={`/projects/${id}/connections`}>Аккаунты площадок</a>
        <a href={`/projects/${id}/members`}>Участники проекта</a>
      </p>
      {error && <p className="error" role="alert">{error}</p>}
      <form className="stack" action={renameProjectAction}>
        <input type="hidden" name="projectId" value={id} />
        <label>Название проекта<input name="name" defaultValue={project.name} minLength={2} required /></label>
        <button className="pri">Сохранить название</button>
      </form>
      <details className="resource-details">
        <summary>Удалить проект</summary>
        <p>Будут удалены материалы ({impact.materials}) вместе с комментариями, ссылками и историей,
          аккаунты площадок ({impact.accounts}) и приглашения ({impact.invites}).
          Участники ({impact.members}) потеряют доступ к проекту. Их личные учётные записи сохранятся.</p>
        <form className="stack" action={deleteProjectAction}>
          <input type="hidden" name="projectId" value={id} />
          <label>Для удаления введите «{project.name}»<input name="confirmation" autoComplete="off" required /></label>
          <button className="danger">Удалить проект навсегда</button>
        </form>
      </details>
    </Shell>
  );
}
