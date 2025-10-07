import { useDroppable } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { Todo, Priority } from "../types/todo";
import { SortableTodoItem } from "./SortableTodoItem";
import { EmptyState } from "./EmptyState";

interface DroppableSectionProps {
  id: string;
  todos: Todo[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string, newText: string) => void;
  onPriorityChange: (id: string, priority: Priority) => void;
}

export function DroppableSection({
  id,
  todos,
  onToggle,
  onDelete,
  onEdit,
  onPriorityChange,
}: DroppableSectionProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: id,
  });

  return (
    <div className="flex-1 flex flex-col">
      <div
        ref={setNodeRef}
        className={`overflow-y-auto scrollbar-hide space-y-2 transition-colors ${
          isOver ? "border-primary/40 bg-primary/5" : "border-border"
        }`}
      >
        <SortableContext items={todos.map((todo) => todo.id)}>
          {todos.length === 0 ? (
            <EmptyState />
          ) : (
            todos.map((todo) => (
              <SortableTodoItem
                key={todo.id}
                todo={todo}
                onToggle={onToggle}
                onDelete={onDelete}
                onEdit={onEdit}
                onPriorityChange={onPriorityChange}
              />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
}
