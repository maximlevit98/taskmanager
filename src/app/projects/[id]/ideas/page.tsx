import { withdrawIdeaAction } from "@/app/content-actions";
import { BrandShell } from "@/components/BrandShell";
import { getUser } from "@/lib/auth";
import { listUnits } from "@/lib/content";
import { getProjectForUser } from "@/lib/projects";
import { notFound, redirect } from "next/navigation";

export default async function IdeasPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const user = await getUser();
  if (!user) redirect("/login");
  const project = await getProjectForUser(id, user.id);
  if (!project) notFound();
  if (project.role === "approver") redirect(`/projects/${id}/approve`);
  const ideas = (await listUnits(id)).filter((unit) => unit.status === "idea");

  return (
    <BrandShell projectId={id} active="ideas">
      <h1>Идеи</h1>
      <p className="lead">Без вида, без аккаунта и без слота. В календаре их нет.</p>
      {error ? <div className="error">{error}</div> : null}
      {ideas.length === 0 ? <p className="muted">Пока пусто. Новая единица может остаться идеей.</p> : null}
      <div className="idea-grid">
        {ideas.map((idea) => (
          <article className="idea" key={idea.id}>
            <div className="kicker">идея</div>
            <h2>{idea.title}</h2>
            <p>{idea.body || "Текста пока нет."}</p>
            <p className="muted">
              {idea.people.length
                ? `Участвуют ${idea.people.map((person) => person.name).join(", ")}`
                : "Участников пока нет"}
            </p>
            <p className="muted">Вид, аккаунт и время появятся при переносе в календарь.</p>
            <div className="actions">
              <a className="pri" href={`/projects/${id}/new?from=${idea.id}`}>
                Сделать единицей
              </a>
              <form action={withdrawIdeaAction}>
                <input type="hidden" name="projectId" value={id} />
                <input type="hidden" name="unitId" value={idea.id} />
                <button className="sec" type="submit">
                  Снять
                </button>
              </form>
            </div>
          </article>
        ))}
      </div>
    </BrandShell>
  );
}
