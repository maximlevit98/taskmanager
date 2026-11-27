import { loginAction } from "@/app/actions";
import { getUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const invited = next === "invites";
  if (await getUser()) redirect(invited ? "/invites" : "/projects");
  return (
    <div className="auth">
      <form className="stack" action={loginAction}>
        {invited && <input type="hidden" name="next" value="invites" />}
        <h1>Вход</h1>
        <p className="lead">Задачи контента для команды бренда.</p>
        {error ? <div className="error">{error}</div> : null}
        <label>
          Почта
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <label>
          Пароль
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <button className="pri" type="submit">
          Войти
        </button>
        <a href={invited ? "/register?next=invites" : "/register"}>Создать аккаунт</a>
      </form>
    </div>
  );
}
