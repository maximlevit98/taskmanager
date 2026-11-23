import { addAccountAction, toggleAccountAction } from "@/app/content-actions";
import { BrandShell } from "@/components/BrandShell";
import { getUser } from "@/lib/auth";
import { platformLabel, platforms } from "@/lib/catalog";
import { listAccounts } from "@/lib/content";
import { getProjectForUser, listMembers } from "@/lib/projects";
import { notFound, redirect } from "next/navigation";

export default async function ConnectionsPage({
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
  const [accounts, members] = await Promise.all([listAccounts(id), listMembers(id)]);

  return (
    <BrandShell projectId={id} active="connections">
      <h1>Подключения</h1>
      <p className="lead">
        Отсюда берётся поле «на какой аккаунт». Прямой отправки нет: слот любого аккаунта остаётся напоминанием, человек
        выкладывает сам.
      </p>
      {error ? <div className="error">{error}</div> : null}
      <div className="account-list">
        {accounts.length === 0 ? <p className="muted">Аккаунтов ещё нет. Добавьте первый — он появится в новой единице.</p> : null}
        {accounts.map((account) => (
          <div className="account" key={account.id}>
            <b>{platformLabel(account.platform)}</b>
            <span>
              {account.handle}
              {account.kind ? <small>{account.kind}</small> : null}
            </span>
            <span>{account.owner_name ? `выкладывает ${account.owner_name}` : "ещё не назначен"}</span>
            <form action={toggleAccountAction}>
              <input type="hidden" name="projectId" value={id} />
              <input type="hidden" name="accountId" value={account.id} />
              <input type="hidden" name="connected" value={account.connected ? "no" : "yes"} />
              <button className={account.connected ? "tag on" : "tag"} type="submit">
                {account.connected ? "подключён" : "не подключён"}
              </button>
            </form>
          </div>
        ))}
      </div>
      <h2>Добавить аккаунт</h2>
      <form className="stack" action={addAccountAction}>
        <input type="hidden" name="projectId" value={id} />
        <label>
          Площадка
          <select name="platform" defaultValue="instagram">
            {platforms.map((platform) => (
              <option key={platform.id} value={platform.id}>
                {platform.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Аккаунт
          <input name="handle" placeholder="@brand" required />
        </label>
        <label>
          Какой это
          <input name="kind" placeholder="основной, канал, страница" />
        </label>
        <label>
          Кто выкладывает
          <select name="ownerUserId" defaultValue="">
            <option value="">не назначен</option>
            {members.map((member) => (
              <option key={member.user_id} value={member.user_id}>
                {member.name}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input name="connected" type="checkbox" />
          Уже подключён
        </label>
        <button className="pri" type="submit">
          Добавить
        </button>
      </form>
    </BrandShell>
  );
}
