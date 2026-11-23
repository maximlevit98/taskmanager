import { registerAction } from "@/app/actions";
import { getUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getUser()) redirect("/projects");
  const { error } = await searchParams;
  return (
    <div className="auth">
      <form className="stack" action={registerAction}>
        <h1>Регистрация</h1>
        <p className="lead">После входа можно создать проект и собрать команду.</p>
        {error ? <div className="error">{error}</div> : null}
        <label>
          Имя
          <input name="name" required />
        </label>
        <label>
          Почта
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <label>
          Пароль
          <input name="password" type="password" autoComplete="new-password" required />
        </label>
        <label>
          Пароль ещё раз
          <input name="again" type="password" autoComplete="new-password" required />
        </label>
        <button className="pri" type="submit">
          Зарегистрироваться
        </button>
        <a href="/login">Уже есть аккаунт</a>
      </form>
    </div>
  );
}
