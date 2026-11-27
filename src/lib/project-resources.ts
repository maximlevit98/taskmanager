import { isAssignableRole } from "./auth";
import { isPlatform } from "./catalog";
import { isUniqueViolation, query, transaction, type Sql } from "./db";

export function isResourceId(value: string) {
  return /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(value);
}

type Operation = (sql: Sql, projectName: string) => Promise<string | null>;

async function withProjectRole(projectId: string, actor: string, roles: string[], operation: Operation) {
  if (!isResourceId(projectId)) return "Проект не найден";
  return transaction(async (sql) => {
    const { rows } = await sql<{ name: string }>(
      `select p.name from projects p join project_members m on m.project_id = p.id
       where p.id = $1 and m.user_id = $2 and m.role = any($3::text[]) for update of p, m`,
      [projectId, actor, roles],
    );
    if (!rows.length) return "Недостаточно прав для изменения проекта";
    return operation(sql, rows[0].name);
  });
}

function asOwner(projectId: string, actor: string, operation: Operation) {
  return withProjectRole(projectId, actor, ["owner"], operation);
}

export function renameProject(projectId: string, actor: string, value: string) {
  return asOwner(projectId, actor, async (sql) => {
    const name = value.trim();
    if (name.length < 2) return "Введите название из двух или более символов";
    await sql("update projects set name = $2 where id = $1", [projectId, name]);
    return null;
  });
}

export function deleteProject(projectId: string, actor: string, confirmation: string) {
  return asOwner(projectId, actor, async (sql, name) => {
    if (confirmation !== name) return "Введите текущее название проекта полностью";
    await sql("delete from projects where id = $1", [projectId]);
    return null;
  });
}

export async function deletionImpact(projectId: string) {
  const { rows } = await query<{ materials: number; accounts: number; members: number; invites: number }>(
    `select (select count(*)::int from units where project_id = $1) as materials,
            (select count(*)::int from accounts where project_id = $1) as accounts,
            (select count(*)::int from project_members where project_id = $1) as members,
            (select count(*)::int from project_invites where project_id = $1) as invites`,
    [projectId],
  );
  return rows[0];
}

export async function accountMaterialCounts(projectId: string) {
  const { rows } = await query<{ account_id: string; total: number }>(
    `select account_id, count(*)::int as total from units
     where project_id = $1 and account_id is not null group by account_id`, [projectId],
  );
  return new Map(rows.map(({ account_id, total }) => [account_id, total]));
}

type AccountFields = {
  platform: string;
  handle: string;
  kind: string;
  ownerUserId: string;
  connected: boolean;
};

async function accountUsage(sql: Sql, projectId: string, accountId: string) {
  if (!isResourceId(accountId)) return null;
  const { rows } = await sql<{ platform: string; handle: string }>(
    "select platform, handle from accounts where project_id = $1 and id = $2 for update",
    [projectId, accountId],
  );
  if (!rows.length) return null;
  // Hold the account lock while checking links, including concurrent FK inserts.
  const links = await sql("select 1 from units where account_id = $1 limit 1", [accountId]);
  return { ...rows[0], inUse: Boolean(links.rowCount) };
}

export function saveAccount(projectId: string, actor: string, accountId: string | null, fields: AccountFields) {
  const roles = accountId === null ? ["owner", "member", "publisher"] : ["owner"];
  return withProjectRole(projectId, actor, roles, async (sql) => {
    const handle = fields.handle.trim();
    if (!isPlatform(fields.platform) || !handle) return "Выберите площадку и укажите аккаунт";
    if (fields.ownerUserId) {
      if (!isResourceId(fields.ownerUserId)) return "Выберите участника проекта";
      const result = await sql("select 1 from project_members where project_id = $1 and user_id = $2 for share", [
        projectId, fields.ownerUserId,
      ]);
      if (!result.rowCount) return "Выберите участника проекта";
    }
    const values = [projectId, fields.platform, handle, fields.kind.trim(), fields.ownerUserId || null, fields.connected];
    if (accountId === null) {
      await sql(`insert into accounts (project_id, platform, handle, kind, owner_user_id, connected, id)
                 values ($1,$2,$3,$4,$5,$6,$7)`, [...values, crypto.randomUUID()]);
    } else {
      const account = await accountUsage(sql, projectId, accountId);
      if (!account) return "Аккаунт не найден";
      if (account.inUse && (account.platform !== fields.platform || account.handle !== handle)) {
        return "Площадка и адрес закреплены за материалами. Отключите аккаунт и добавьте отдельный для нового адреса";
      }
      await sql(`update accounts set platform = $2, handle = $3, kind = $4, owner_user_id = $5, connected = $6
                 where project_id = $1 and id = $7`, [...values, accountId]);
    }
    return null;
  });
}

export function deleteAccount(projectId: string, actor: string, accountId: string) {
  return asOwner(projectId, actor, async (sql) => {
    const account = await accountUsage(sql, projectId, accountId);
    if (!account) return "Аккаунт не найден";
    if (account.inUse) return "У аккаунта есть связанные материалы. Отключите аккаунт, чтобы сохранить историю публикаций";
    await sql("delete from accounts where project_id = $1 and id = $2", [projectId, accountId]);
    return null;
  });
}

export async function updateMember(projectId: string, actor: string, userId: string, role: string | null) {
  try {
    return await asOwner(projectId, actor, async (sql) => {
      if (!isResourceId(userId)) return "Участник не найден";
      const { rows } = await sql<{ role: string }>(
        "select role from project_members where project_id = $1 and user_id = $2 for update", [projectId, userId],
      );
      if (!rows.length) return "Участник не найден";
      if (rows[0].role === "owner") return "Владелец должен остаться владельцем проекта";
      if (role === null) {
        await sql("update accounts set owner_user_id = null where project_id = $1 and owner_user_id = $2", [projectId, userId]);
        await sql("delete from project_members where project_id = $1 and user_id = $2", [projectId, userId]);
      } else {
        if (!isAssignableRole(role)) return "Выберите роль";
        await sql("update project_members set role = $3 where project_id = $1 and user_id = $2", [projectId, userId, role]);
      }
      return null;
    });
  } catch (error) {
    if (isUniqueViolation(error)) return "Согласующий в проекте уже назначен";
    throw error;
  }
}
