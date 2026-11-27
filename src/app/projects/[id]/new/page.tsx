import { createUnitAction } from "@/app/content-actions";
import { BrandShell } from "@/components/BrandShell";
import { NewUnitForm } from "@/components/NewUnitForm";
import { getUser } from "@/lib/auth";
import { getUnit, listAccounts } from "@/lib/content";
import { ideaFormValues } from "@/lib/idea-form";
import { defaultSlotInput } from "@/lib/dates";
import { getProjectForUser, listMembers } from "@/lib/projects";
import { notFound, redirect } from "next/navigation";

export default async function NewUnitPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; from?: string }>;
}) {
  const { id } = await params;
  const { error, from } = await searchParams;
  const user = await getUser();
  if (!user) redirect("/login");
  const project = await getProjectForUser(id, user.id);
  if (!project) notFound();
  if (project.role === "approver") redirect(`/projects/${id}/approve`);
  const [accounts, members] = await Promise.all([listAccounts(id), listMembers(id)]);
  const source = from ? await getUnit(id, from) : null;
  const idea = source?.status === "idea" ? source : null;

  return (
    <BrandShell projectId={id} active="new">
      <h1>Новая единица</h1>
      <p className="lead">
        {idea
          ? `Из идеи «${idea.title}». Пока нет слота, в календарь не встанет.`
          : "Название, вид, аккаунт и участники. Без слота это идея, и в календаре её нет."}
      </p>
      {error ? <div className="error">{error}</div> : null}
      <NewUnitForm
        saveAction={createUnitAction}
        key={idea?.id ?? "new"}
        projectId={id}
        members={members.map((member) => ({ user_id: member.user_id, name: member.name }))}
        accounts={accounts.map((account) => ({
          id: account.id,
          platform: account.platform,
          handle: account.handle,
          kind: account.kind,
        }))}
        defaultSlot={defaultSlotInput()}
        idea={idea ? ideaFormValues(idea, members) : undefined}
      />
    </BrandShell>
  );
}
