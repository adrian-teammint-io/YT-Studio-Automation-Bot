import { Button } from "@/components/ui/button";
import { Github, Download } from "lucide-react";

interface TodoHeaderProps {
  totalCount: number;
  onExportToMarkdown: () => void;
  onPasteCurrentUrl: () => void;
}

/**
 * Header section showing date, task count, and action buttons.
 */
export function TodoHeader({
  totalCount,
  onExportToMarkdown,
  onPasteCurrentUrl,
}: TodoHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center w-9 h-9 bg-primary rounded-lg shadow-md">
          <span className="text-sm font-bold text-primary-foreground">{totalCount}</span>
        </div>
        <div>
          <h1 className="text-xl font-bold text-primary">
            {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
          </h1>
          <p className="text-xs text-muted-foreground">
            Keep it simple as fuck
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={onExportToMarkdown}
          className="flex items-center gap-2 px-3 py-1.5 hover:bg-secondary"
        >
          <Download className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onPasteCurrentUrl}
          className="flex items-center gap-2 px-3 py-1.5 hover:bg-secondary"
        >
          <Github className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
