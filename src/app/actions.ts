"use server";

import { redirect } from "next/navigation";
import { getUser, isAssignableRole } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";
import { isUniqueViolation, query } from "@/lib/db";
import { addParticipant, resendInvite, resolveInvite } from "@/lib/invites";
import { createProject, getProjectForUser } from "@/lib/projects";
import { clearSession, setSession } from "@/lib/session";

function back(path: string, message: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);
}

export async function registerAction(formData: FormData) {
  const invited = formData.get("next") === "invites";
  const path = invited ? "/register?next=invites" : "/register";
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const again = String(formData.get("again") || "");
  if (name.length < 2) back(path, "Укажите имя");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) back(path, "Укажите почту");
  if (password.length < 8) back(path, "Пароль не короче 8 символов");
  if (password !== again) back(path, "Пароли не совпадают");

  const id = crypto.randomUUID();
  try {
    await query("insert into users (id, name, email, password_hash) values ($1, $2, $3, $4)", [
      id,
      name,
      email,
      await hashPassword(password),
    ]);
  } catch (error) {
    if (isUniqueViolation(error)) back(path, "Такая почта уже зарегистрирована");
    throw error;
  }
  await setSession(id);
  redirect(invited ? "/invites" : "/projects");
}

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const result = await query<{ id: string; password_hash: string }>(
    "select id, password_hash from users where email = $1",
    [email],
  );
  const invited = formData.get("next") === "invites";
  const user = result.rows[0];
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    back(invited ? "/login?next=invites" : "/login", "Почта или пароль не подходят");
  }
  await setSession(user.id);
  redirect(invited ? "/invites" : "/projects");
}

export async function logoutAction() {
  await clearSession();
  redirect("/login");
}

export async function createProjectAction(formData: FormData) {
  const user = await getUser();
  if (!user) redirect("/login");
  const name = String(formData.get("name") || "").trim();
  if (name.length < 2) back("/projects/new", "Назовите проект");
  const id = await createProject(user, name);
  redirect(`/projects/${id}/members`);
}

async function ownerProject(projectId: string) {
  const user = await getUser();
  if (!user) redirect("/login");
  const project = await getProjectForUser(projectId, user.id);
  if (!project) back("/projects", "Проект не найден");
  if (project.role !== "owner") back(`/projects/${projectId}/members`, "Состав меняет только владелец");
  return project;
}

export async function addParticipantAction(formData: FormData) {
  const projectId = String(formData.get("projectId") || "");
  await ownerProject(projectId);
  const message = await addParticipant(
    projectId,
    String(formData.get("email") || ""),
    String(formData.get("role") || ""),
  );
  if (message) back(`/projects/${projectId}/members`, message);
  redirect(`/projects/${projectId}/members`);
}

export async function changeRoleAction(formData: FormData) {
  const projectId = String(formData.get("projectId") || "");
  const userId = String(formData.get("userId") || "");
  const role = String(formData.get("role") || "");
  await ownerProject(projectId);
  if (!isAssignableRole(role)) back(`/projects/${projectId}/members`, "Выберите роль");
  const target = await query<{ role: string }>(
    "select role from project_members where project_id = $1 and user_id = $2",
    [projectId, userId],
  );
  if (!target.rows[0]) back(`/projects/${projectId}/members`, "Участник не найден");
  if (target.rows[0].role === "owner") back(`/projects/${projectId}/members`, "Роль владельца не меняется");
  try {
    await query(
      "update project_members set role = $3 where project_id = $1 and user_id = $2",
      [projectId, userId, role],
    );
  } catch (error) {
    if (isUniqueViolation(error)) back(`/projects/${projectId}/members`, "Согласующий в проекте уже назначен");
    throw error;
  }
  redirect(`/projects/${projectId}/members`);
}

export async function removeMemberAction(formData: FormData) {
  const projectId = String(formData.get("projectId") || "");
  const userId = String(formData.get("userId") || "");
  await ownerProject(projectId);
  const target = await query<{ role: string }>(
    "select role from project_members where project_id = $1 and user_id = $2",
    [projectId, userId],
  );
  if (target.rows[0]?.role === "owner") back(`/projects/${projectId}/members`, "Владельца нельзя убрать");
  await query("delete from project_members where project_id = $1 and user_id = $2", [
    projectId,
    userId,
  ]);
  redirect(`/projects/${projectId}/members`);
}

export async function cancelInviteAction(formData: FormData) {
  const projectId = String(formData.get("projectId") || "");
  const inviteId = String(formData.get("inviteId") || "");
  await ownerProject(projectId);
  await query("delete from project_invites where id = $1 and project_id = $2", [inviteId, projectId]);
  redirect(`/projects/${projectId}/members`);
}

export async function resendInviteAction(data: FormData) {
  const projectId = String(data.get("projectId") || "");
  await ownerProject(projectId);
  const message = await resendInvite(projectId, String(data.get("inviteId") || ""));
  if (message) back(`/projects/${projectId}/members`, message);
  redirect(`/projects/${projectId}/members`);
}

export async function resolveInviteAction(data: FormData) {
  const projectId = String(data.get("projectId") || "");
  await ownerProject(projectId);
  const message = await resolveInvite(projectId, String(data.get("inviteId") || ""), String(data.get("role") || ""));
  if (message) back(`/projects/${projectId}/members`, message);
  redirect(`/projects/${projectId}/members`);
}
