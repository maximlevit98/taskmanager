import { query } from "./db";
import { sessionUserId } from "./session";

export type User = { id: string; name: string; email: string };

export type Role = "owner" | "member" | "approver" | "publisher";

export const assignableRoles: { id: Exclude<Role, "owner">; label: string; hint: string }[] = [
  { id: "member", label: "Участник", hint: "Готовит материалы" },
  { id: "approver", label: "Согласующий", hint: "Единственное «да» на проект" },
  { id: "publisher", label: "Публикатор", hint: "Выкладывает пост вручную" },
];

export function roleLabel(role: Role) {
  if (role === "owner") return "Владелец";
  return assignableRoles.find((item) => item.id === role)?.label ?? role;
}

export async function getUser(): Promise<User | null> {
  const id = await sessionUserId();
  if (!id) return null;
  const result = await query<User>("select id, name, email from users where id = $1", [id]);
  return result.rows[0] ?? null;
}

export function isAssignableRole(value: string): value is Exclude<Role, "owner"> {
  return value === "member" || value === "approver" || value === "publisher";
}
