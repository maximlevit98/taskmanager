import nodemailer from "nodemailer";

export async function sendInviteMail(invite: { email: string; project_name: string; role: string }, code: string) {
  const { INVITE_SMTP_URL, INVITE_FROM, APP_PUBLIC_URL } = process.env;
  if (!INVITE_SMTP_URL || !INVITE_FROM || !APP_PUBLIC_URL) throw new Error("Missing invite mail configuration");
  const url = new URL("/invites", APP_PUBLIC_URL);
  const smtp = new URL(INVITE_SMTP_URL);
  if (!["smtp:", "smtps:"].includes(smtp.protocol)) throw new Error("Invalid SMTP protocol");
  const transport = nodemailer.createTransport(INVITE_SMTP_URL, {
    from: INVITE_FROM,
  });
  const result = await transport.sendMail({
    to: { name: "", address: invite.email },
    subject: "Приглашение в проект",
    text: [
      `Вас пригласили в проект «${invite.project_name}».`,
      invite.role === "publisher" ? "Ваша роль — публикатор." :
        invite.role === "member" ? "Ваша роль — участник." : "Владелец выберет роль после подтверждения адреса.",
      "Войдите или зарегистрируйтесь с этим адресом и введите код на странице приглашений.",
      url.href,
      "",
      "Одноразовый код подтверждения (действует 24 часа):",
      code,
    ].join("\n"),
  });
  if (!result.accepted.length) throw new Error("SMTP recipient rejected");
}
