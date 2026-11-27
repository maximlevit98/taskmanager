import { addParticipantAction, cancelInviteAction, resendInviteAction, resolveInviteAction } from "@/app/actions";
import { roleLabel } from "@/lib/auth";
import { inviteRoles, listInvites } from "@/lib/invites";

const stateLabels = {
  unsent: "Нужно отправить письмо",
  waiting: "Ожидает подтверждения почты",
  expired: "Срок кода истёк",
  conflict: "Почта подтверждена. Выберите роль для этого приглашения",
};

function InviteRoleSelect() {
  return (
    <label>
      Роль
      <select name="role" defaultValue="member">
        {inviteRoles.map(role => <option key={role} value={role}>{roleLabel(role)}</option>)}
      </select>
    </label>
  );
}

export async function ProjectInvites({ projectId }: { projectId: string }) {
  const invites = await listInvites(projectId);
  return (
    <>
      <h2>Пригласить участника</h2>
      <form className="stack" action={addParticipantAction}>
        <input type="hidden" name="projectId" value={projectId} />
        <label>Почта<input name="email" type="email" required /></label>
        <InviteRoleSelect />
        <button className="pri" type="submit">Отправить приглашение</button>
        <p className="muted">Участник получит одноразовый код по почте. Код действует 24 часа.</p>
      </form>
      {invites.length > 0 && (
        <section>
          <h2>Приглашения</h2>
          <ul className="list">
            {invites.map(invite => {
              const ids = (
                <>
                  <input type="hidden" name="projectId" value={projectId} />
                  <input type="hidden" name="inviteId" value={invite.id} />
                </>
              );
              return (
                <li key={invite.id}>
                  <b>{invite.email}</b> · {roleLabel(invite.role)}
                  <p>{stateLabels[invite.state]}</p>
                  {invite.state === "conflict" ? (
                    <form className="inline" action={resolveInviteAction}>
                      {ids}
                      <InviteRoleSelect />
                      <button className="sec" type="submit">Назначить</button>
                    </form>
                  ) : (
                    <form action={resendInviteAction}>
                      {ids}
                      <button className="sec" type="submit">Отправить новый код</button>
                    </form>
                  )}
                  <form action={cancelInviteAction}>
                    {ids}
                    <button className="sec" type="submit">Отменить приглашение</button>
                  </form>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
