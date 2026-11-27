import { createAccountAction, editAccountAction, deleteAccountAction } from "@/app/resource-actions";
import { AccountFields } from "@/components/AccountFields";
import { BrandShell } from "@/components/BrandShell";
import { getUser } from "@/lib/auth";
import { platformLabel } from "@/lib/catalog";
import { listAccounts } from "@/lib/content";
import { accountMaterialCounts } from "@/lib/project-resources";
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
  const [accounts, members, counts] = await Promise.all([listAccounts(id), listMembers(id), accountMaterialCounts(id)]);

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
            <span>{account.connected ? "Подключён" : "Отключён"}</span>
            {project.role === "owner" && (
              <div className="account-controls">
                <details className="resource-details">
                  <summary>Редактировать аккаунт</summary>
                  <form action={editAccountAction} className="stack">
                    <input type="hidden" name="projectId" value={id} />
                    <input type="hidden" name="accountId" value={account.id} />
                    <AccountFields account={account} members={members} linked={counts.has(account.id)} />
                    <p className="muted">Отключение меняет статус подключения. Слоты, ручное планирование и отметка выхода остаются доступны.</p>
                    <button className="pri">Сохранить изменения</button>
                  </form>
                </details>
                <details className="resource-details">
                  <summary>Удалить аккаунт</summary>
                  {counts.has(account.id) ? (
                    <p>Связанных материалов: {counts.get(account.id)}. Чтобы сохранить историю публикаций, откройте «Редактировать аккаунт» и снимите отметку «Подключён». Слоты, согласования и отметки выхода сохранятся.</p>
                  ) : (
                    <form action={deleteAccountAction} className="stack">
                      <input type="hidden" name="projectId" value={id} />
                      <input type="hidden" name="accountId" value={account.id} />
                      <p>Связанных материалов нет. Аккаунт {account.handle} исчезнет из списка для планирования.</p>
                      <button className="danger">Удалить аккаунт из проекта</button>
                    </form>
                  )}
                </details>
              </div>
            )}
          </div>
        ))}
      </div>
      <h2>Добавить аккаунт</h2>
      <form className="stack" action={createAccountAction}>
        <input type="hidden" name="projectId" value={id} />
        <AccountFields members={members} />
        <button className="pri" type="submit">
          Добавить
        </button>
      </form>
    </BrandShell>
  );
}
