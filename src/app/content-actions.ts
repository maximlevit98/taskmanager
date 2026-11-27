"use server";

import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import {
  addComment,
  changeSlot,
  createAccount,
  decide,
  markOutcome,
  saveCompose,
  saveLink,
  saveUnit,
  sendForApproval,
  setAccountConnected,
  withdrawIdea,
} from "@/lib/content";
import { parseSlot } from "@/lib/dates";
import { getProjectForUser, listMembers } from "@/lib/projects";

function withError(path: string, message: string): never {
  const join = path.includes("?") ? "&" : "?";
  redirect(`${path}${join}error=${encodeURIComponent(message)}`);
}

function safeReturn(projectId: string, value: string, fallback: string) {
  if (!value.startsWith(`/projects/${projectId}`)) return fallback;
  if (value.startsWith("//") || value.includes("://")) return fallback;
  return value;
}

async function team(projectId: string) {
  const user = await getUser();
  if (!user) redirect("/login");
  const project = await getProjectForUser(projectId, user.id);
  if (!project) redirect("/projects?error=" + encodeURIComponent("Проект не найден"));
  if (project.role === "approver") withError(`/projects/${projectId}/approve`, "Это экран команды");
  return { user, project };
}

async function member(projectId: string) {
  const user = await getUser();
  if (!user) redirect("/login");
  const project = await getProjectForUser(projectId, user.id);
  if (!project) redirect("/projects?error=" + encodeURIComponent("Проект не найден"));
  return { user, project };
}

export async function createUnitAction(formData: FormData) {
  const projectId = String(formData.get("projectId") || "");
  const { user } = await team(projectId);
  const intent = formData.get("intent") === "idea" ? "idea" : "slot";
  const members = await listMembers(projectId);
  const people = formData.getAll("person").map((value) => {
    const userId = String(value);
    return { userId, task: String(formData.get(`task-${userId}`) || "") };
  });
  const ideaId = String(formData.get("ideaId") || "");
  const failTo = ideaId ? `/projects/${projectId}/new?from=${ideaId}` : `/projects/${projectId}/new`;
  const result = await saveUnit({
    projectId,
    userId: user.id,
    memberIds: members.map((item) => item.user_id),
    ideaId: ideaId || undefined,
    intent,
    title: String(formData.get("title") || ""),
    body: String(formData.get("body") || ""),
    contentType: String(formData.get("contentType") || ""),
    accountId: String(formData.get("accountId") || ""),
    slotAt: intent === "slot" ? parseSlot(String(formData.get("slot") || "")) : null,
    tone: String(formData.get("tone") || "sand"),
    people,
  });
  if ("error" in result) withError(failTo, result.error || "Не получилось сохранить");
  if (intent === "idea") redirect(`/projects/${projectId}/ideas`);
  redirect(`/projects/${projectId}?unit=${result.id}`);
}

export async function saveComposeAction(formData: FormData) {
  const projectId = String(formData.get("projectId") || "");
  const unitId = String(formData.get("unitId") || "");
  const { user } = await team(projectId);
  const back = safeReturn(projectId, String(formData.get("returnTo") || ""), `/projects/${projectId}?unit=${unitId}`);
  const message = await saveCompose(projectId, user.id, unitId, {
    title: String(formData.get("title") || ""),
    body: String(formData.get("body") || ""),
    contentType: String(formData.get("contentType") || ""),
    accountId: String(formData.get("accountId") || ""),
  });
  if (message) withError(back, message);
  redirect(back);
}

export async function saveLinkAction(formData: FormData) {
  const projectId = String(formData.get("projectId") || "");
  const unitId = String(formData.get("unitId") || "");
  const { user } = await team(projectId);
  const back = safeReturn(projectId, String(formData.get("returnTo") || ""), `/projects/${projectId}?unit=${unitId}`);
  const message = await saveLink(
    projectId,
    user.id,
    unitId,
    String(formData.get("url") || ""),
    String(formData.get("label") || ""),
  );
  if (message) withError(back, message);
  redirect(back);
}

export async function addCommentAction(formData: FormData) {
  const projectId = String(formData.get("projectId") || "");
  const unitId = String(formData.get("unitId") || "");
  const { user } = await team(projectId);
  const back = safeReturn(projectId, String(formData.get("returnTo") || ""), `/projects/${projectId}?unit=${unitId}`);
  const message = await addComment(projectId, user.id, unitId, String(formData.get("body") || ""));
  if (message) withError(back, message);
  redirect(back);
}

export async function changeSlotAction(formData: FormData) {
  const projectId = String(formData.get("projectId") || "");
  const unitId = String(formData.get("unitId") || "");
  const { user } = await team(projectId);
  const back = safeReturn(projectId, String(formData.get("returnTo") || ""), `/projects/${projectId}?unit=${unitId}`);
  const slotAt = parseSlot(String(formData.get("slot") || ""));
  if (!slotAt) withError(back, "Поставьте время слота");
  const message = await changeSlot(projectId, user.id, unitId, slotAt);
  if (message) withError(back, message);
  redirect(back);
}

export async function withdrawIdeaAction(formData: FormData) {
  const projectId = String(formData.get("projectId") || "");
  const unitId = String(formData.get("unitId") || "");
  const { user } = await team(projectId);
  const message = await withdrawIdea(projectId, user.id, unitId);
  if (message) withError(`/projects/${projectId}/ideas`, message);
  redirect(`/projects/${projectId}/ideas`);
}

export async function sendForApprovalAction(formData: FormData) {
  const projectId = String(formData.get("projectId") || "");
  const unitId = String(formData.get("unitId") || "");
  const { user } = await team(projectId);
  const back = safeReturn(projectId, String(formData.get("returnTo") || ""), `/projects/${projectId}?unit=${unitId}`);
  const message = await sendForApproval(projectId, user.id, unitId);
  if (message) withError(back, message);
  redirect(back);
}

export async function decideAction(formData: FormData) {
  const projectId = String(formData.get("projectId") || "");
  const unitId = String(formData.get("unitId") || "");
  const { user, project } = await member(projectId);
  const back = safeReturn(projectId, String(formData.get("returnTo") || ""), `/projects/${projectId}/approve`);
  if (project.role !== "approver") withError(back, "«Да» говорит только согласующий");
  const version = Number(formData.get("expectedVersion"));
  const round = Number(formData.get("expectedReviewRound"));
  const decision = formData.get("decision");
  if (decision !== "yes" && decision !== "no") withError(back, "Выберите решение");
  const message = await decide(projectId, user.id, unitId, version, round, decision === "yes", String(formData.get("reason") || ""));
  if (message) withError(back, message);
  redirect(back);
}

export async function markOutcomeAction(formData: FormData) {
  const projectId = String(formData.get("projectId") || "");
  const unitId = String(formData.get("unitId") || "");
  const { user, project } = await member(projectId);
  const back = safeReturn(projectId, String(formData.get("returnTo") || ""), `/projects/${projectId}?unit=${unitId}`);
  if (project.role !== "owner" && project.role !== "publisher") {
    withError(back, "Отметку ставит владелец или публикатор");
  }
  const version = Number(formData.get("expectedVersion"));
  const attempt = Number(formData.get("expectedPublicationAttempt"));
  const outcome = formData.get("outcome");
  if (outcome !== "out" && outcome !== "failed") withError(back, "Выберите результат публикации");
  const message = await markOutcome(projectId, user.id, unitId, version, attempt, outcome, String(formData.get("reason") || ""));
  if (message) withError(back, message);
  redirect(back);
}

export async function addAccountAction(formData: FormData) {
  const projectId = String(formData.get("projectId") || "");
  await team(projectId);
  const owner = String(formData.get("ownerUserId") || "");
  const members = await listMembers(projectId);
  const message = await createAccount({
    projectId,
    platform: String(formData.get("platform") || ""),
    handle: String(formData.get("handle") || ""),
    kind: String(formData.get("kind") || ""),
    ownerUserId: members.some((item) => item.user_id === owner) ? owner : null,
    connected: formData.get("connected") === "on",
  });
  if (message) withError(`/projects/${projectId}/connections`, message);
  redirect(`/projects/${projectId}/connections`);
}

export async function toggleAccountAction(formData: FormData) {
  const projectId = String(formData.get("projectId") || "");
  await team(projectId);
  const message = await setAccountConnected(
    projectId,
    String(formData.get("accountId") || ""),
    formData.get("connected") === "yes",
  );
  if (message) withError(`/projects/${projectId}/connections`, message);
  redirect(`/projects/${projectId}/connections`);
}
