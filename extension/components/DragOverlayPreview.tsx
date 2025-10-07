import { Streamdown } from "streamdown";
import { Todo } from "../types/todo";
import { getRelativeDate, formatFullDate } from "../utils/date-format";
import { BORDER_RADIUS } from "../constants/ui";

interface DragOverlayPreviewProps {
  todo: Todo;
}

/**
 * Preview shown while dragging a todo item.
 */
export function DragOverlayPreview({ todo }: DragOverlayPreviewProps) {
  return (
    <div
      className="flex items-center gap-3 p-3 border-input bg-card shadow-lg max-w-[460px]"
      style={{ borderRadius: BORDER_RADIUS }}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm text-card-foreground break-words">
          <Streamdown>{todo.text}</Streamdown>
        </div>
        <div className="text-xs text-muted-foreground/60 mt-1">
          {getRelativeDate(todo.createdAt)}, {formatFullDate(todo.createdAt)}
        </div>
      </div>
    </div>
  );
}
