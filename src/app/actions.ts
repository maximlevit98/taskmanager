"use server";

import { redirect } from "next/navigation";
import { getUser, isAssignableRole } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";
import { isUniqueViolation, query } from "@/lib/db";
import { acceptInvites, addParticipant, createProject, getProjectForUser } from "@/lib/projects";
import { clearSession, setSession } from "@/lib/session";

function back(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export async function registerAction(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const again = String(formData.get("again") || "");
  if (name.length < 2) back("/register", "Укажите имя");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) back("/register", "Укажите почту");
  if (password.length < 8) back("/register", "Пароль не короче 8 символов");
  if (password !== again) back("/register", "Пароли не совпадают");

  const id = crypto.randomUUID();
  try {
    await query("insert into users (id, name, email, password_hash) values ($1, $2, $3, $4)", [
      id,
      name,
      email,
      await hashPassword(password),
    ]);
  } catch (error) {
    if (isUniqueViolation(error)) back("/register", "Такая почта уже зарегистрирована");
    throw error;
  }
  await acceptInvites(id, email);
  await setSession(id);
  redirect("/projects");
}

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const result = await query<{ id: string; password_hash: string }>(
    "select id, password_hash from users where email = $1",
    [email],
  );
  const user = result.rows[0];
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    back("/login", "Почта или пароль не подходят");
  }
  await setSession(user.id);
  redirect("/projects");
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
  redirect(`/projects/${id}`);
}

async function ownerProject(projectId: string) {
  const user = await getUser();
  if (!user) redirect("/login");
  const project = await getProjectForUser(projectId, user.id);
  if (!project) back("/projects", "Проект не найден");
  if (project.role !== "owner") back(`/projects/${projectId}`, "Состав меняет только владелец");
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
  if (message) back(`/projects/${projectId}`, message);
  redirect(`/projects/${projectId}`);
}

export async function changeRoleAction(formData: FormData) {
  const projectId = String(formData.get("projectId") || "");
  const userId = String(formData.get("userId") || "");
  const role = String(formData.get("role") || "");
  await ownerProject(projectId);
  if (!isAssignableRole(role)) back(`/projects/${projectId}`, "Выберите роль");
  const target = await query<{ role: string }>(
    "select role from project_members where project_id = $1 and user_id = $2",
    [projectId, userId],
  );
  if (!target.rows[0]) back(`/projects/${projectId}`, "Участник не найден");
  if (target.rows[0].role === "owner") back(`/projects/${projectId}`, "Роль владельца не меняется");
  try {
    await query(
      "update project_members set role = $3 where project_id = $1 and user_id = $2",
      [projectId, userId, role],
    );
  } catch (error) {
    if (isUniqueViolation(error)) back(`/projects/${projectId}`, "Согласующий в проекте уже назначен");
    throw error;
  }
  redirect(`/projects/${projectId}`);
}

export async function removeMemberAction(formData: FormData) {
  const projectId = String(formData.get("projectId") || "");
  const userId = String(formData.get("userId") || "");
  await ownerProject(projectId);
  const target = await query<{ role: string }>(
    "select role from project_members where project_id = $1 and user_id = $2",
    [projectId, userId],
  );
  if (target.rows[0]?.role === "owner") back(`/projects/${projectId}`, "Владельца нельзя убрать");
  await query("delete from project_members where project_id = $1 and user_id = $2", [
    projectId,
    userId,
  ]);
  redirect(`/projects/${projectId}`);
}

export async function cancelInviteAction(formData: FormData) {
  const projectId = String(formData.get("projectId") || "");
  const inviteId = String(formData.get("inviteId") || "");
  await ownerProject(projectId);
  await query("delete from project_invites where id = $1 and project_id = $2", [inviteId, projectId]);
  redirect(`/projects/${projectId}`);
}
