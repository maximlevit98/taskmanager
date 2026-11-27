import type { Unit } from "./content";

type SavedIdea = Pick<Unit, "id" | "title" | "body" | "tone" | "people">;

export function ideaFormValues(idea: SavedIdea, members: { user_id: string }[]) {
  const activeIds = new Set(members.map((member) => member.user_id));
  const active = idea.people.filter((person) => activeIds.has(person.user_id));
  return {
    id: idea.id,
    title: idea.title,
    body: idea.body,
    tone: idea.tone,
    archived: idea.people.filter((person) => !activeIds.has(person.user_id)),
    people: active.map((person) => person.user_id),
    tasks: Object.fromEntries(active.map((person) => [person.user_id, person.task])),
  };
}

export function updateTask(tasks: Record<string, string>, userId: string, task: string) {
  return { ...tasks, [userId]: task };
}
