import { isUniqueViolation, query } from "./db";
import { isAssignableRole, type Role, type User } from "./auth";

export type Membership = {
  project_id: string;
  project_name: string;
  role: Role;
  created_at: string;
};

export type MemberRow = {
  user_id: string;
  name: string;
  email: string;
  role: Role;
};

export type InviteRow = {
  id: string;
  email: string;
  role: Exclude<Role, "owner">;
};

export async function acceptInvites(userId: string, email: string) {
  const invites = await query<InviteRow & { project_id: string }>(
    "select id, project_id, email, role from project_invites where email = $1",
    [email],
  );
  for (const invite of invites.rows) {
    const already = await query(
      "select 1 from project_members where project_id = $1 and user_id = $2",
      [invite.project_id, userId],
    );
    if (!already.rowCount) {
      try {
        await query(
          "insert into project_members (project_id, user_id, role) values ($1, $2, $3)",
          [invite.project_id, userId, invite.role],
        );
      } catch (error) {
        if (!isUniqueViolation(error) || invite.role !== "approver") throw error;
        await query(
          "insert into project_members (project_id, user_id, role) values ($1, $2, 'member')",
          [invite.project_id, userId],
        );
      }
    }
    await query("delete from project_invites where id = $1", [invite.id]);
  }
}

export async function listProjects(userId: string) {
  const result = await query<Membership>(
    `select p.id as project_id, p.name as project_name, m.role, p.created_at::text
     from projects p
     join project_members m on m.project_id = p.id
     where m.user_id = $1
     order by p.created_at desc`,
    [userId],
  );
  return result.rows;
}

export async function getProjectForUser(projectId: string, userId: string) {
  const result = await query<{ id: string; name: string; role: Role }>(
    `select p.id, p.name, m.role
     from projects p
     join project_members m on m.project_id = p.id
     where p.id = $1 and m.user_id = $2`,
    [projectId, userId],
  );
  return result.rows[0] ?? null;
}

export async function listMembers(projectId: string) {
  const result = await query<MemberRow>(
    `select u.id as user_id, u.name, u.email, m.role
     from project_members m
     join users u on u.id = m.user_id
     where m.project_id = $1
     order by case m.role when 'owner' then 0 when 'approver' then 1 when 'publisher' then 2 else 3 end, u.name`,
    [projectId],
  );
  return result.rows;
}

export async function listInvites(projectId: string) {
  const result = await query<InviteRow>(
    "select id, email, role from project_invites where project_id = $1 order by created_at",
    [projectId],
  );
  return result.rows;
}

export async function createProject(user: User, name: string) {
  const id = crypto.randomUUID();
  await query("insert into projects (id, name) values ($1, $2)", [id, name]);
  await query(
    "insert into project_members (project_id, user_id, role) values ($1, $2, 'owner')",
    [id, user.id],
  );
  return id;
}

export async function addParticipant(projectId: string, email: string, role: string) {
  if (!isAssignableRole(role)) return "Выберите роль";
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return "Укажите почту участника";
  const user = await query<{ id: string }>("select id from users where email = $1", [normalized]);
  if (!user.rows[0]) {
    try {
      await query(
        "insert into project_invites (id, project_id, email, role) values ($1, $2, $3, $4)",
        [crypto.randomUUID(), projectId, normalized, role],
      );
    } catch (error) {
      if (isUniqueViolation(error)) return "На эту почту приглашение уже есть";
      throw error;
    }
    return null;
  }
  const existing = await query(
    "select 1 from project_members where project_id = $1 and user_id = $2",
    [projectId, user.rows[0].id],
  );
  if (existing.rowCount) return "Этот человек уже в проекте";
  try {
    await query(
      "insert into project_members (project_id, user_id, role) values ($1, $2, $3)",
      [projectId, user.rows[0].id, role],
    );
  } catch (error) {
    if (isUniqueViolation(error)) return "Согласующий в проекте уже назначен";
    throw error;
  }
  return null;
}
