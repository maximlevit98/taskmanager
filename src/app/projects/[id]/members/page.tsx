import {
  changeRoleAction,
  removeMemberAction,
} from "@/app/actions";
import { ProjectInvites } from "@/components/ProjectInvites";
import { BrandShell } from "@/components/BrandShell";
import { assignableRoles, getUser, roleLabel } from "@/lib/auth";
import { getProjectForUser, listMembers } from "@/lib/projects";
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
  const owner = project.role === "owner";
  const approver = members.find((member) => member.role === "approver");

  return (
    <BrandShell projectId={id} active="members">
      <h1>Участники</h1>
      <p className="lead">Ваша роль: {roleLabel(project.role)}. Согласующий в проекте один.</p>
      {error ? <div className="error">{error}</div> : null}
      <div className="note">
        {approver
          ? `${approver.name} согласует. Без этого «да» слот не публикуется. Дальше — единица контента.`
          : "Назначьте одного согласующего. Без его «да» слот не публикуется."}
        <p className="actions">
          <a className="pri" href={`/projects/${id}/new`}>
            Новая единица
          </a>
          <a className="sec" href={`/projects/${id}`}>
            Календарь
          </a>
        </p>
      </div>

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

      {owner && <ProjectInvites projectId={id} />}
    </BrandShell>
  );
}
