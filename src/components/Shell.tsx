import { logoutAction } from "@/app/actions";
import { getUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export async function Shell({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect("/login");
  return (
    <div className="app">
      <aside>
        <div className="brand">
          <span className="mark">К</span> Контент
        </div>
        <nav>
          <a className="on" href="/projects">
            Проекты
          </a>
        </nav>
        <div className="foot">
          <b>{user.name}</b>
          <br />
          {user.email}
          <form action={logoutAction}>
            <button type="submit">Выйти</button>
          </form>
        </div>
      </aside>
      <main>{children}</main>
    </div>
  );
}
