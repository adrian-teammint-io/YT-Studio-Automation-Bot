import { Todo } from "../types/todo";

/**
 * Exports todos as markdown list for easy copy-paste.
 * Each todo becomes a markdown list item (- text).
 */
export function generateMarkdown(todos: Todo[]): string {
  return todos.map((todo) => `- ${todo.text}`).join("\n");
}
