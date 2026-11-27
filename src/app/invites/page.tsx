import { getUser } from "@/lib/auth";
import { confirmInviteAction } from "./actions";

export default async function InvitesPage({ searchParams }: { searchParams: Promise<{ message?: string }> }) {
  const user = await getUser();
  const { message } = await searchParams;
  return (
    <main className="auth">
      <section className="stack">
        <h1>Принять приглашение</h1>
        {message && <p role="status">{message}</p>}
        {user ? (
          <form className="stack" action={confirmInviteAction}>
            <p>Вы вошли как {user.email}. Введите код из письма на этот адрес.</p>
            <label>Код приглашения<input name="code" autoComplete="one-time-code" required /></label>
            <button type="submit" className="pri">Подтвердить адрес и принять приглашение</button>
            <a href="/projects">Мои проекты</a>
          </form>
        ) : (
          <>
            <p>Войдите или создайте аккаунт с адресом, на который пришло письмо.</p>
            <a className="pri" href="/login?next=invites">Войти</a>
            <a href="/register?next=invites">Создать аккаунт</a>
          </>
        )}
      </section>
    </main>
  );
}
