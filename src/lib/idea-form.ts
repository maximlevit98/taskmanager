import type { Unit } from "./content";

type SavedIdea = Pick<Unit, "id" | "title" | "body" | "tone" | "people">;

export function ideaFormValues(idea: SavedIdea) {
  return {
    id: idea.id,
    title: idea.title,
    body: idea.body,
    tone: idea.tone,
    people: idea.people.map((person) => person.user_id),
    tasks: Object.fromEntries(idea.people.map((person) => [person.user_id, person.task])),
  };
}

export function updateTask(tasks: Record<string, string>, userId: string, task: string) {
  return { ...tasks, [userId]: task };
}
