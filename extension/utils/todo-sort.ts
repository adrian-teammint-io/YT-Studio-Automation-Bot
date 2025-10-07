import { Todo } from "../types/todo";
import { priorityConfig } from "../constants/priority";

/**
 * Sorts todos with a three-level hierarchy:
 * 1. Incomplete tasks before completed tasks
 * 2. Within incomplete: high > medium > low priority
 * 3. Within same priority: newer tasks first
 *
 * Returns a new array without mutating the original.
 */
export function sortTodosByPriority(todos: Todo[]): Todo[] {
  return [...todos].sort((a, b) => {
    // Completed tasks always sink to bottom
    if (a.completed !== b.completed) {
      return a.completed ? 1 : -1;
    }

    // Sort by priority order (lower order number = higher priority)
    const priorityDiff = priorityConfig[a.priority].order - priorityConfig[b.priority].order;
    if (priorityDiff !== 0) return priorityDiff;

    // Same priority: show newest first (descending timestamp)
    return b.createdAt - a.createdAt;
  });
}
