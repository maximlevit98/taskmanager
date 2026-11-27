"use server";

import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { deleteAccount, deleteProject, isResourceId, renameProject, saveAccount, updateMember } from "@/lib/project-resources";

function field(form: FormData, key: string) {
  return String(form.get(key) ?? "");
}

async function context(form: FormData) {
  const user = await getUser();
  if (!user) redirect("/login");
  const project = field(form, "projectId");
  if (!isResourceId(project)) redirect("/projects?error=" + encodeURIComponent("Проект не найден"));
  return { project, actor: user.id };
}

function finish(path: string, message: string | null) {
  redirect(message ? path + "?error=" + encodeURIComponent(message) : path);
}

export async function renameProjectAction(form: FormData) {
  const { project, actor } = await context(form);
  finish(`/projects/${project}/settings`, await renameProject(project, actor, field(form, "name")));
}

export async function deleteProjectAction(form: FormData) {
  const { project, actor } = await context(form);
  const message = await deleteProject(project, actor, field(form, "confirmation"));
  finish(message ? `/projects/${project}/settings` : "/projects", message);
}

async function writeAccount(form: FormData, accountId: string | null) {
  const { project, actor } = await context(form);
  const message = await saveAccount(project, actor, accountId, {
    platform: field(form, "platform"), handle: field(form, "handle"), kind: field(form, "kind"),
    ownerUserId: field(form, "ownerUserId"), connected: field(form, "connected") === "on",
  });
  finish(`/projects/${project}/connections`, message);
}

export async function createAccountAction(form: FormData) {
  await writeAccount(form, null);
}

export async function editAccountAction(form: FormData) {
  await writeAccount(form, field(form, "accountId"));
}

export async function deleteAccountAction(form: FormData) {
  const { project, actor } = await context(form);
  finish(`/projects/${project}/connections`, await deleteAccount(project, actor, field(form, "accountId")));
}

export async function changeRoleAction(form: FormData) {
  const { project, actor } = await context(form);
  finish(`/projects/${project}/members`, await updateMember(project, actor, field(form, "userId"), field(form, "role")));
}

export async function removeMemberAction(form: FormData) {
  const { project, actor } = await context(form);
  finish(`/projects/${project}/members`, await updateMember(project, actor, field(form, "userId"), null));
}
