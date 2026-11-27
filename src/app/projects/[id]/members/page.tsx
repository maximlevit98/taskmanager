import {
  addParticipantAction,
  cancelInviteAction,
} from "@/app/actions";
import { changeRoleAction, removeMemberAction } from "@/app/resource-actions";
import { BrandShell } from "@/components/BrandShell";
import { assignableRoles, getUser, roleLabel } from "@/lib/auth";
import { getProjectForUser, listInvites, listMembers } from "@/lib/projects";
import { notFound, redirect } from "next/navigation";

export default async function MembersPage({
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
  const members = await listMembers(id);
  const invites = await listInvites(id);
  const owner = project.role === "owner";

  return (
    <BrandShell projectId={id} active="members">
      <h1>Участники</h1>
      <p className="lead">Ваша роль в проекте — {roleLabel(project.role)}.</p>
      {error ? <div className="error">{error}</div> : null}
      <p className="actions">
        <a className="pri" href={`/projects/${id}/new`}>Новая единица</a>
        <a className="sec" href={`/projects/${id}`}>Календарь</a>
      </p>

      <table className="table">
        <tbody>
          {members.map((member) => (
            <tr key={member.user_id}>
              <td>
                <b>{member.name}</b>
                <div className="muted">{member.email}</div>
              </td>
              <td>
                {owner && member.role !== "owner" ? (
                  <form className="inline" action={changeRoleAction}>
                    <input type="hidden" name="projectId" value={id} />
                    <input type="hidden" name="userId" value={member.user_id} />
                    <select name="role" aria-label={`Роль ${member.name}`} defaultValue={member.role}>
                      {assignableRoles.filter((role) => role.id !== "approver" || member.role === "approver").map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.label}
                        </option>
                      ))}
                    </select>
                    <button className="sec" type="submit">
                      Сохранить
                    </button>
                  </form>
                ) : (
                  roleLabel(member.role)
                )}
              </td>
              <td>
                {owner && member.role !== "owner" ? (
                  <details className="resource-details">
                    <summary>Убрать из проекта</summary>
                    <p>{member.name} потеряет доступ к проекту. Учётная запись, поручения и история останутся.
                      Для аккаунтов этого сотрудника потребуется выбрать другого ответственного.</p>
                    <form action={removeMemberAction}>
                      <input type="hidden" name="projectId" value={id} />
                      <input type="hidden" name="userId" value={member.user_id} />
                      <button className="sec" type="submit">
                        Убрать из проекта
                      </button>
                    </form>
                  </details>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {owner ? (
        <>
          <h2>Добавить участника</h2>
          <form className="stack" action={addParticipantAction}>
            <input type="hidden" name="projectId" value={id} />
            <label>
              Почта
              <input name="email" type="email" placeholder="anya@brand.ru" required />
            </label>
            <label>
              Роль
              <select name="role" defaultValue="member">
                {assignableRoles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.label} — {role.hint}
                  </option>
                ))}
              </select>
            </label>
            <button className="pri" type="submit">
              Добавить
            </button>
            <p className="muted">Если почты ещё нет в системе, человек получит проект сразу после регистрации.</p>
          </form>
        </>
      ) : null}

      {owner && invites.length > 0 ? (
        <>
          <h2>Ждут регистрацию</h2>
          <table className="table">
            <tbody>
              {invites.map((invite) => (
                <tr key={invite.id}>
                  <td>
                    <b>{invite.email}</b>
                    <div className="muted">{roleLabel(invite.role)}</div>
                  </td>
                  <td>
                    <form action={cancelInviteAction}>
                      <input type="hidden" name="projectId" value={id} />
                      <input type="hidden" name="inviteId" value={invite.id} />
                      <button className="sec" type="submit">
                        Отменить
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
    </BrandShell>
  );
}
