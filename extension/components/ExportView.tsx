import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Copy, ArrowLeft } from "lucide-react";
import { POPUP_WIDTH, POPUP_HEIGHT } from "../constants/ui";

interface ExportViewProps {
  markdown: string;
  onBack: () => void;
  onCopy: () => void;
}

/**
 * Markdown export view with copy button.
 * - Backspace: Return to main view
 */
export function ExportView({ markdown, onBack, onCopy }: ExportViewProps) {
  // Handle backspace to go back
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Backspace") {
        e.preventDefault();
        onBack();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onBack]);

  return (
    <div className="dark bg-background" style={{ width: POPUP_WIDTH, height: POPUP_HEIGHT }}>
      <div className="h-full flex flex-col p-4">
        <Card className="flex-1 flex flex-col shadow-xl border-border">
          <CardHeader className="space-y-3 pb-4">
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={onBack}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onCopy}
                className="flex items-center gap-2"
              >
                <Copy className="w-4 h-4" />
                Copy
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto scrollbar-hide">
            <pre className="text-xs text-card-foreground whitespace-pre-wrap font-mono">
              {markdown}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
