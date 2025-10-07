import * as React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Check, X } from "lucide-react";

interface TodoItemEditModeProps {
  initialValue: string;
  onSave: (newText: string) => void;
  onCancel: () => void;
  style?: React.CSSProperties;
  setNodeRef?: (node: HTMLElement | null) => void;
}

/**
 * Inline edit mode for todos with keyboard shortcuts:
 * - Enter: Save
 * - Escape: Cancel
 * - Auto-expands textarea to fit content
 */
export function TodoItemEditMode({
  initialValue,
  onSave,
  onCancel,
  style,
  setNodeRef,
}: TodoItemEditModeProps) {
  const [editValue, setEditValue] = React.useState(initialValue);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Auto-focus and auto-expand textarea on mount
  React.useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
      // Reset height to auto to calculate actual content height
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, []);

  const handleSave = () => {
    if (editValue.trim()) {
      onSave(editValue.trim());
    }
  };

  const handleCancel = () => {
    setEditValue(initialValue);
    onCancel();
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group flex items-center gap-2 p-3 border bg-card hover:shadow-md transition-all duration-200 border-primary/50"
    >
      <Textarea
        ref={textareaRef}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSave();
          } else if (e.key === "Escape") {
            handleCancel();
          }
        }}
        className="flex-1 min-h-[32px] max-h-[120px] resize-none text-sm p-2 scrollbar-hide"
      />
      <Button
        variant="ghost"
        size="sm"
        onClick={handleSave}
        className="h-8 w-8 p-0 hover:bg-primary/10 hover:text-primary"
      >
        <Check className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleCancel}
        className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}
