import {
  addParticipantAction,
  cancelInviteAction,
  changeRoleAction,
  removeMemberAction,
} from "@/app/actions";
import { Shell } from "@/components/Shell";
import { assignableRoles, getUser, roleLabel } from "@/lib/auth";
import { getProjectForUser, listInvites, listMembers } from "@/lib/projects";
import { notFound } from "next/navigation";

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const user = await getUser();
  if (!user) notFound();
  const project = await getProjectForUser(id, user.id);
  if (!project) notFound();
  const members = await listMembers(id);
  const invites = await listInvites(id);
  const owner = project.role === "owner";
  const approver = members.find((member) => member.role === "approver");

  return (
    <Shell>
      <h1>{project.name}</h1>
      <p className="lead">Ваша роль: {roleLabel(project.role)}</p>
      {error ? <div className="error">{error}</div> : null}
      <div className="note">
        {approver
          ? `Согласующий: ${approver.name}. Без его «да» пост не выйдет.`
          : "Согласующего ещё нет. Назначьте одного: без его «да» пост не выходит."}
      </div>

      <h2>Участники</h2>
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
                    <select name="role" defaultValue={member.role}>
                      {assignableRoles.map((role) => (
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
                  <form action={removeMemberAction}>
                    <input type="hidden" name="projectId" value={id} />
                    <input type="hidden" name="userId" value={member.user_id} />
                    <button className="sec" type="submit">
                      Убрать
                    </button>
                  </form>
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
            <p className="muted">
              Если почты ещё нет в системе, человек получит проект сразу после регистрации.
            </p>
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
    </Shell>
  );
}
