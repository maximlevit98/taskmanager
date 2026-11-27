import { decideAction } from "@/app/content-actions";
import { BrandShell } from "@/components/BrandShell";
import { getUser } from "@/lib/auth";
import { platformLabel, typeLabel } from "@/lib/catalog";
import { listUnits, type Unit } from "@/lib/content";
import { getProjectForUser } from "@/lib/projects";
import { notFound, redirect } from "next/navigation";

export default async function ApprovePage({
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
  const units = await listUnits(id);
  const waiting = units.filter((unit) => unit.gate === "pending");
  const returned = units.filter((unit) => unit.gate === "returned");
  const approved = units.filter((unit) => unit.gate === "yes");
  const canDecide = project.role === "approver";

  return (
    <BrandShell projectId={id} active="approve">
      <h1>Согласование</h1>
      <p className="lead">
        {canDecide
          ? "Два действия: «да» и «вернуть с причиной». «Да» ничего не публикует."
          : "Очередь согласующего. «Да» ставит только он, с этого входа."}
      </p>
      {error ? <div className="error">{error}</div> : null}
      <div className="cols">
        <Column title="Ждут «да»" units={waiting} projectId={id} canDecide={canDecide} />
        <Column title="Вернул" units={returned} projectId={id} canDecide={false} />
        <Column title="Согласовал" units={approved} projectId={id} canDecide={false} />
      </div>
    </BrandShell>
  );
}

function Column({
  title,
  units,
  projectId,
  canDecide,
}: {
  title: string;
  units: Unit[];
  projectId: string;
  canDecide: boolean;
}) {
  return (
    <section className="col">
      <h2>
        {title} <span className="muted">{units.length}</span>
      </h2>
      {units.length === 0 ? <p className="muted">Пусто.</p> : null}
      {units.map((unit) => (
        <article className="idea" key={unit.id}>
          <h3>{unit.title}</h3>
          <p className="meta">
            {typeLabel(unit.content_type) || "без вида"}
            {unit.handle ? ` · ${platformLabel(unit.platform)} · ${unit.handle}` : ""}
            {` · версия ${unit.version}`}
          </p>
          <p>{unit.body || "Текста нет."}</p>
          {unit.links[0] ? (
            <p>
              <a href={unit.links[0].url} target="_blank" rel="noreferrer">
                {unit.links[0].label || unit.links[0].url}
              </a>
            </p>
          ) : (
            <p className="muted">Ссылки на файл нет.</p>
          )}
          {unit.return_reason ? <p>Причина: {unit.return_reason}</p> : null}
          {canDecide ? (
            <div className="stack tight">
              <form action={decideAction}>
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="unitId" value={unit.id} />
                <input type="hidden" name="expectedVersion" value={unit.version} />
                <input type="hidden" name="decision" value="yes" />
                <input type="hidden" name="returnTo" value={`/projects/${projectId}/approve`} />
                <button className="pri" type="submit">
                  Да
                </button>
              </form>
              <form className="stack tight" action={decideAction}>
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="unitId" value={unit.id} />
                <input type="hidden" name="expectedVersion" value={unit.version} />
                <input type="hidden" name="decision" value="no" />
                <input type="hidden" name="returnTo" value={`/projects/${projectId}/approve`} />
                <input name="reason" placeholder="Что вернуть" required />
                <button className="sec" type="submit">
                  Вернуть с причиной
                </button>
              </form>
            </div>
          ) : null}
        </article>
      ))}
    </section>
  );
}
