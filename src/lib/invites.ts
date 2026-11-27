import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Role, User } from "./auth";
import { query, transaction, type Sql } from "./db";
import { sendInviteMail } from "./invite-mail";

type StoredRole = Exclude<Role, "owner">;
export type PendingInvite = {
  id: string;
  email: string;
  role: StoredRole;
  state: "unsent" | "waiting" | "expired" | "conflict";
};
type VerifiedInvite = { id: string; project_id: string; role: StoredRole };
const invalid = "Код недействителен для этого аккаунта или срок приглашения истёк.";
const conflict = "Адрес подтверждён. Владелец проекта должен выбрать роль.";

export const inviteRoles = ["member", "publisher"] as const;
type InviteRole = typeof inviteRoles[number];

function isInviteRole(role: string): role is InviteRole {
  return role === "member" || role === "publisher";
}

function isSingleMailbox(email: string) {
  return email.length <= 254 && /^[^\s@,;:<>()[\]"\\]+@[^\s@,;:<>()[\]"\\]+\.[^\s@,;:<>()[\]"\\]+$/.test(email);
}

function digest(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

export async function listInvites(projectId: string) {
  const { rows } = await query<PendingInvite>(
    `select id, email, role, case
       when verified_user_id is not null then 'conflict'
       when token_hash is null then 'unsent'
       when expires_at <= now() then 'expired'
       else 'waiting' end as state
     from project_invites where project_id = $1 order by created_at`, [projectId],
  );
  return rows;
}

export async function resendInvite(projectId: string, inviteId: string) {
  const code = randomBytes(24).toString("base64url");
  const hash = digest(code);
  const issued = await query<{ email: string; project_name: string; role: StoredRole }>(
    `update project_invites i set token_hash=$3, expires_at=now()+interval '24 hours'
     from projects p where p.id=i.project_id and i.project_id=$1 and i.id=$2 and i.verified_user_id is null
     returning i.email, p.name as project_name, i.role`,
    [projectId, inviteId, hash],
  );
  if (!issued.rowCount) return "Приглашение уже обработано. Обновите страницу.";
  try {
    if (!isSingleMailbox(issued.rows[0].email)) throw new Error("Invalid stored recipient");
    await sendInviteMail(issued.rows[0], code);
  } catch {
    // A later resend may already have succeeded. Revoke only our own credential.
    await query("update project_invites set token_hash=null, expires_at=null where id=$1 and token_hash=$2", [inviteId, hash]);
    return "Письмо не отправлено. Проверьте настройки почты и повторите отправку.";
  }
  return null;
}

export async function addParticipant(projectId: string, rawEmail: string, role: string) {
  const email = rawEmail.trim().toLowerCase();
  if (!isInviteRole(role)) return "Выберите роль";
  if (!isSingleMailbox(email)) return "Укажите один адрес почты";
  const member = await query(
    "select 1 from project_members m join users u on u.id=m.user_id where m.project_id=$1 and u.email=$2",
    [projectId, email],
  );
  if (member.rowCount) return "Этот человек уже в проекте";
  const id = randomUUID();
  const created = await query(
    `insert into project_invites(id,project_id,email,role) values ($1,$2,$3,$4)
     on conflict(project_id,email) do nothing`, [id, projectId, email, role],
  );
  if (!created.rowCount) return "На эту почту приглашение уже есть";
  return resendInvite(projectId, id);
}

async function grant(sql: Sql, invite: VerifiedInvite, userId: string, role: InviteRole) {
  const { rowCount } = await sql(
    `insert into project_members(project_id,user_id,role) values ($1,$2,$3)
     on conflict(project_id,user_id) do nothing`,
    [invite.project_id, userId, role],
  );
  if (!rowCount) {
    const { rows } = await sql<{ role: Role }>(
      "select role from project_members where project_id=$1 and user_id=$2 for update",
      [invite.project_id, userId],
    );
    if (rows[0]?.role !== role && rows[0]?.role !== "owner") return false;
  }
  await sql("delete from project_invites where id=$1", [invite.id]);
  return true;
}

export async function confirmInvite(user: Pick<User, "id" | "email">, rawCode: string) {
  const code = rawCode.trim();
  if (!/^[\w-]{32}$/.test(code)) return { message: invalid };
  return transaction(async (sql) => {
    const result = await sql<VerifiedInvite>(
      `update project_invites set verified_user_id=$1, token_hash=null, expires_at=null
       where email=$2 and token_hash=$3 and expires_at>clock_timestamp() and verified_user_id is null
       returning id,project_id,role`, [user.id, user.email, digest(code)],
    );
    const invite = result.rows[0];
    if (!invite) return { message: invalid };
    if (!isInviteRole(invite.role) || !await grant(sql, invite, user.id, invite.role)) return { message: conflict };
    return { projectId: invite.project_id };
  });
}

export async function resolveInvite(projectId: string, inviteId: string, role: string) {
  if (!isInviteRole(role)) return "Выберите роль";
  return transaction(async (sql) => {
    const { rows } = await sql<VerifiedInvite & { verified_user_id: string }>(
      `select id,project_id,role,verified_user_id from project_invites
       where id=$1 and project_id=$2 and verified_user_id is not null for update`, [inviteId, projectId],
    );
    if (!rows[0]) return "Подтверждённое приглашение не найдено";
    // Only the owner's explicit choice may replace a conflicting membership.
    await sql(
      `insert into project_members(project_id,user_id,role) values ($1,$2,$3)
       on conflict(project_id,user_id) do update set role=excluded.role
       where project_members.role <> 'owner'`, [projectId, rows[0].verified_user_id, role],
    );
    await sql("delete from project_invites where id=$1", [inviteId]);
    return null;
  });
}
