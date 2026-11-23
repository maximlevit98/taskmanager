import { loginAction } from "@/app/actions";
import { getUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getUser()) redirect("/projects");
  const { error } = await searchParams;
  return (
    <div className="auth">
      <form className="stack" action={loginAction}>
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
        <a href="/register">Создать аккаунт</a>
      </form>
    </div>
  );
}
