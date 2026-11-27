"use server";

import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
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

export async function cancelInviteAction(formData: FormData) {
  const projectId = String(formData.get("projectId") || "");
  const inviteId = String(formData.get("inviteId") || "");
  await ownerProject(projectId);
  await query("delete from project_invites where id = $1 and project_id = $2", [inviteId, projectId]);
  redirect(`/projects/${projectId}/members`);
}
