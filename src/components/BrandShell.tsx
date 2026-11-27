import { logoutAction } from "@/app/actions";
import { getUser } from "@/lib/auth";
import { listUnits, workFor } from "@/lib/content";
import { getProjectForUser, listMembers } from "@/lib/projects";
import { redirect } from "next/navigation";

export async function BrandShell({
  projectId,
  active,
  children,
}: {
  projectId: string;
  active: string;
  children: React.ReactNode;
}) {
  const user = await getUser();
  if (!user) redirect("/login");
  const project = await getProjectForUser(projectId, user.id);
  if (!project) redirect("/projects");
  const members = await listMembers(projectId);
  const approver = members.find((member) => member.role === "approver");
  const units = await listUnits(projectId);
  const ideas = units.filter((unit) => unit.status === "idea").length;
  const todo = units.reduce((count, unit) => count + workFor(unit, project.role, projectId).length, 0);
  const mark = project.name.trim()[0]?.toUpperCase() || "Б";
  const approverOnly = project.role === "approver";

  return (
    <div className="app brand-app">
      <aside>
        <a className="brand" href="/projects">
          <span className="mark">{mark}</span>
          <span>{project.name}</span>
        </a>
        {approverOnly ? null : (
          <a className="new-unit" href={`/projects/${projectId}/new`}>
            + Новая единица
          </a>
        )}
        <nav>
          <a href="/projects">Все проекты</a>
          {approverOnly ? (
            <a className={active === "approve" ? "on" : ""} href={`/projects/${projectId}/approve`}>
              Согласование
            </a>
          ) : (
            <>
              <a className={active === "todo" ? "on" : ""} href={`/projects/${projectId}/todo`}>
                Сделать {todo > 0 ? <span className="count">{todo}</span> : null}
              </a>
              <a className={active === "calendar" ? "on" : ""} href={`/projects/${projectId}`}>
                Календарь
              </a>
              <a className={active === "ideas" ? "on" : ""} href={`/projects/${projectId}/ideas`}>
                Идеи {ideas > 0 ? <span className="count">{ideas}</span> : null}
              </a>
              <a className={active === "connections" ? "on" : ""} href={`/projects/${projectId}/connections`}>
                Подключения
              </a>
              <a className={active === "members" ? "on" : ""} href={`/projects/${projectId}/members`}>
                Участники
              </a>
            </>
          )}
        </nav>
        <div className="foot">
          {approver ? (
            <>
              Согласует <b>{approver.name}</b>. Без «да» слот молчит.
            </>
          ) : (
            <>Согласующий не назначен. Без его «да» слот не публикуется.</>
          )}
          <div className="who">
            {user.name}
            <form action={logoutAction}>
              <button type="submit">Выйти</button>
            </form>
          </div>
        </div>
      </aside>
      <main>{children}</main>
    </div>
  );
}
