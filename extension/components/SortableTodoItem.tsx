import * as React from "react";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2 } from "lucide-react";
import { Streamdown } from "streamdown";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Todo, Priority } from "../types/todo";
import { priorityConfig } from "../constants/priority";
import { getRelativeDate, formatFullDate } from "../utils/date-format";
import { PriorityDropdown } from "./PriorityDropdown";
import { TodoItemEditMode } from "./TodoItemEditMode";
import { BORDER_RADIUS } from "../constants/ui";

interface SortableTodoItemProps {
  todo: Todo;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string, newText: string) => void;
  onPriorityChange: (id: string, priority: Priority) => void;
}

/**
 * Draggable todo item with inline editing, priority selection, and completion toggle.
 * - Double-click: Toggle completion
 * - Click edit icon: Enter edit mode
 * - Drag: Reorder todos
 */
export function SortableTodoItem({
  todo,
  onToggle,
  onDelete,
  onEdit,
  onPriorityChange,
}: SortableTodoItemProps) {
  const [isEditing, setIsEditing] = React.useState(false);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: todo.id,
  });

  // Drag-and-drop visual state
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    borderRadius: BORDER_RADIUS,
  };

  // Show edit mode when editing
  if (isEditing) {
    return (
      <TodoItemEditMode
        initialValue={todo.text}
        onSave={(newText) => {
          onEdit(todo.id, newText);
          setIsEditing(false);
        }}
        onCancel={() => setIsEditing(false)}
        style={style}
        setNodeRef={setNodeRef}
      />
    );
  }

  // Visual feedback: green for completed, priority color otherwise
  const getBorderColor = () => {
    if (todo.completed) return "border-green-500 hover:border-green-600";
    return `${priorityConfig[todo.priority].color} ${priorityConfig[todo.priority].hoverColor}`;
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onDoubleClick={() => onToggle(todo.id)}
      className={`group flex items-center gap-3 p-3 border-2 bg-card hover:shadow-md transition-all duration-200 cursor-move ${getBorderColor()}`}
    >
      <div className="flex-1 min-w-0">
        <div
          className={`text-sm transition-all duration-200 break-words ${
            todo.completed ? "text-muted-foreground" : "text-card-foreground"
          }`}
        >
          <Streamdown>{todo.text}</Streamdown>
        </div>
        <div className="text-xs text-muted-foreground/60 mt-1">
          {getRelativeDate(todo.createdAt)}, {formatFullDate(todo.createdAt)}
        </div>
      </div>
      <PriorityDropdown onPriorityChange={(priority) => onPriorityChange(todo.id, priority)} />
      <Button
        variant="ghost"
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          setIsEditing(true);
        }}
        className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 p-0 hover:bg-primary/10 hover:text-primary pointer-events-auto"
      >
        <Pencil className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(todo.id);
        }}
        className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive pointer-events-auto"
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
}
