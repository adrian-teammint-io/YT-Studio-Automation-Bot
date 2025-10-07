import { Sparkles } from "lucide-react";

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center py-8 px-2">
      <Sparkles className="w-8 h-8 text-muted-foreground mb-2" />
      <p className="text-xs text-muted-foreground">No tasks yet</p>
    </div>
  );
}
