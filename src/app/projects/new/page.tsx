import { createProjectAction } from "@/app/actions";
import { Shell } from "@/components/Shell";

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <Shell>
      <h1>Новый проект</h1>
      <p className="lead">Вы станете владельцем. Дальше — участники, один согласующий и первая единица.</p>
      <form className="stack" action={createProjectAction}>
        {error ? <div className="error">{error}</div> : null}
        <label>
          Название
          <input name="name" placeholder="Бренд" required />
        </label>
        <button className="pri" type="submit">
          Создать
        </button>
      </form>
    </Shell>
  );
}
