import { Shell } from "@/components/Shell";
import { getUser, roleLabel } from "@/lib/auth";
import { listProjects } from "@/lib/projects";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getUser();
  const projects = user ? await listProjects(user.id) : [];
  const { error } = await searchParams;
  return (
    <Shell>
      <h1>Проекты</h1>
      <p className="lead">Один проект — одна команда бренда.</p>
      {error ? <div className="error">{error}</div> : null}
      <p>
        <a className="pri" href="/projects/new">
          Новый проект
        </a>
      </p>
      <div className="list">
        {projects.length === 0 ? <p className="muted">Пока нет ни одного проекта.</p> : null}
        {projects.map((project) => (
          <a className="card" key={project.project_id} href={`/projects/${project.project_id}`}>
            <span>
              <b>{project.project_name}</b>
              <span>{roleLabel(project.role)}</span>
            </span>
            <span>открыть</span>
          </a>
        ))}
      </div>
    </Shell>
  );
}
