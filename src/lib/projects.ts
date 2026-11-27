import { query } from "./db";
import type { Role, User } from "./auth";

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

export async function createProject(user: User, name: string) {
  const id = crypto.randomUUID();
  await query("insert into projects (id, name) values ($1, $2)", [id, name]);
  await query(
    "insert into project_members (project_id, user_id, role) values ($1, $2, 'owner')",
    [id, user.id],
  );
  return id;
}
