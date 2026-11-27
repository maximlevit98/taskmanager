"use server";

import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { confirmInvite } from "@/lib/invites";

export async function confirmInviteAction(data: FormData) {
  const user = await getUser();
  if (!user) redirect("/login?next=invites");
  const result = await confirmInvite(user, String(data.get("code") || ""));
  if ("projectId" in result) redirect(`/projects/${result.projectId}`);
  redirect("/invites?message=" + encodeURIComponent(result.message));
}
