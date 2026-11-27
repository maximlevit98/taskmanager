import assert from "node:assert/strict";
import test from "node:test";
import { require as loadTsx } from "tsx/cjs/api";

const { ideaFormValues, updateTask } = loadTsx("../src/lib/idea-form.ts", import.meta.url);

const idea = {
  id: "idea-1",
  title: "Новый выпуск",
  body: "Анонс",
  tone: "mint",
  people: [
    { user_id: "editor", name: "Саша", task: "Написать анонс" },
    { user_id: "artist", name: "Саша", task: "Нарисовать обложку" },
  ],
};

test("opening a saved idea restores its color and assignments by user ID", () => {
  assert.deepEqual(ideaFormValues(idea, idea.people), {
    id: "idea-1",
    title: "Новый выпуск",
    body: "Анонс",
    tone: "mint",
    archived: [],
    people: ["editor", "artist"],
    tasks: { editor: "Написать анонс", artist: "Нарисовать обложку" },
  });
});

test("editing or clearing one assignment preserves the other person's task", () => {
  const { tasks } = ideaFormValues(idea, idea.people);
  const edited = updateTask(tasks, "editor", "Проверить текст");
  assert.deepEqual(edited, { editor: "Проверить текст", artist: "Нарисовать обложку" });
  assert.deepEqual(updateTask(edited, "artist", ""), { editor: "Проверить текст", artist: "" });
});
