import assert from "node:assert/strict";
import { after, test } from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { require as loadTsx } from "tsx/cjs/api";

const dom = new JSDOM("<main></main>");
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.FormData = dom.window.FormData;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// React DOM detects browser event support at import time.
const { createRoot } = await import("react-dom/client");
const { NewUnitForm } = loadTsx("../src/components/NewUnitForm.tsx", import.meta.url);
const { ideaFormValues } = loadTsx("../src/lib/idea-form.ts", import.meta.url);
after(() => dom.window.close());

const members = [
  { user_id: "editor", name: "Саша" },
  { user_id: "artist", name: "Саша" },
];
const idea = {
  id: "idea-1",
  title: "Новый выпуск",
  body: "Анонс",
  tone: "mint",
  people: [
    { ...members[0], task: "Написать анонс" },
    { ...members[1], task: "Нарисовать обложку" },
    { user_id: "former", name: "Катя", task: "Собрать исходники" },
  ],
};

for (const intent of ["idea", "slot"]) {
  test(`reopened idea submits its color and both assignments via ${intent}`, async (t) => {
    const root = createRoot(document.querySelector("main"));
    t.after(() => act(async () => root.unmount()));
    const submissions = [];

    await act(async () => root.render(createElement(NewUnitForm, {
      projectId: "project-1",
      members,
      accounts: [{ id: "account-1", platform: "telegram", handle: "brand", kind: "" }],
      defaultSlot: "2026-12-01T10:00",
      idea: ideaFormValues(idea, members),
      saveAction: async (data) => { submissions.push(data); },
    })));

    const form = document.querySelector("form");
    const editorTask = form.elements.namedItem("task-editor");
    assert.equal(form.elements.namedItem("tone").value, "mint");
    assert.deepEqual(new FormData(form).getAll("person"), ["editor", "artist"]);
    assert.match(form.querySelector('[aria-label="Архивные поручения"]').textContent, /Катя — Собрать исходники/);
    assert.equal(form.elements.namedItem("task-former"), null);
    assert.deepEqual(new FormData(form).getAll("initialPerson"), ["editor", "artist"]);
    const artist = form.querySelector('input[type="checkbox"][value="artist"]');
    await act(async () => artist.click());
    const unchecked = new FormData(form);
    assert.deepEqual(unchecked.getAll("initialPerson"), ["editor", "artist"]);
    assert.deepEqual(unchecked.getAll("person"), ["editor"]);
    await act(async () => artist.click());
    assert.equal(editorTask.value, "Написать анонс");
    assert.equal(form.elements.namedItem("task-artist").value, "Нарисовать обложку");

    // Use the native setter so React observes the change as a user input event.
    const { set } = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
    set.call(editorTask, "Проверить текст");
    await act(async () => editorTask.dispatchEvent(new window.Event("input", { bubbles: true })));
    await act(async () => form.querySelector(`button[value="${intent}"]`).click());

    assert.equal(submissions.length, 1);
    const [data] = submissions;
    assert.equal(data.get("ideaId"), idea.id);
    assert.equal(data.get("intent"), intent);
    assert.equal(data.get("tone"), "mint");
    assert.deepEqual(data.getAll("person"), ["editor", "artist"]);
    assert.equal(data.get("task-editor"), "Проверить текст");
    assert.equal(data.get("task-artist"), "Нарисовать обложку");
  });
}
