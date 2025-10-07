import { Priority } from "../types/todo";

/**
 * Priority configuration for visual styling and sorting.
 * - color: Border color for incomplete todos
 * - hoverColor: Border hover state
 * - order: Sort priority (1=highest, 3=lowest)
 */
export const priorityConfig: Record<Priority, { color: string; hoverColor: string; order: number }> = {
  low: { color: "border-blue-500", hoverColor: "hover:border-blue-600", order: 3 },
  medium: { color: "border-yellow-500", hoverColor: "hover:border-yellow-600", order: 2 },
  high: { color: "border-red-500", hoverColor: "hover:border-red-600", order: 1 },
};
