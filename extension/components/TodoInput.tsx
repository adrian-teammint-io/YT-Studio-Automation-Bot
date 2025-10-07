import * as React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";
import { CommandPalette } from "./CommandPalette";

interface Command {
  name: string;
  description: string;
}

interface TodoInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isCommandMode: boolean;
  onToggleCommandMode: () => void;
  commands: Command[];
  selectedCommandIndex: number;
  onNavigateCommands: (direction: "next" | "prev") => void;
  onSelectCommand: (name: string) => void;
  onEscape: () => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

/**
 * Input component with command mode support.
 * - Press ':' to enter command mode
 * - Ctrl+N/P to navigate commands
 * - Enter to submit
 * - Escape to exit command mode
 */
export function TodoInput({
  value,
  onChange,
  onSubmit,
  isCommandMode,
  onToggleCommandMode,
  commands,
  selectedCommandIndex,
  onNavigateCommands,
  onSelectCommand,
  onEscape,
  textareaRef,
}: TodoInputProps) {
  return (
    <div className="flex items-center w-[420px] gap-2">
      <div className={`relative transition-all duration-200 ${isCommandMode ? "w-full" : "w-[380px]"}`}>
        <Textarea
          ref={textareaRef}
          placeholder={isCommandMode ? "Enter command..." : "What needs to be done?"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === ":") {
              e.preventDefault();
              onToggleCommandMode();
              return;
            }

            if (e.key === "Escape" && isCommandMode) {
              e.preventDefault();
              onEscape();
              return;
            }

            if (isCommandMode && e.ctrlKey && e.key === "n") {
              e.preventDefault();
              onNavigateCommands("next");
              return;
            }

            if (isCommandMode && e.ctrlKey && e.key === "p") {
              e.preventDefault();
              onNavigateCommands("prev");
              return;
            }

            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (isCommandMode && !value && commands[selectedCommandIndex]) {
                // If in command mode with no input, select the highlighted command
                onSelectCommand(commands[selectedCommandIndex].name);
              } else {
                // Execute the command or add todo
                onSubmit();
              }
            }
          }}
          className={`pr-4 min-h-[44px] max-h-[120px] resize-none border-2 bg-card/50 focus-visible:ring-2 overflow-y-auto scrollbar-hide transition-all duration-200 rounded-xl ${
            isCommandMode
              ? "border-yellow-500 focus-visible:border-yellow-500 focus-visible:ring-yellow-500/20"
              : "border-border focus-visible:border-primary focus-visible:ring-primary/20"
          }`}
        />
        {isCommandMode && (
          <CommandPalette
            commands={commands}
            selectedIndex={selectedCommandIndex}
            onSelectCommand={onSelectCommand}
          />
        )}
      </div>
      {!isCommandMode && (
        <Button
          onClick={onSubmit}
          size="lg"
          className="h-11 bg-primary hover:bg-primary/90 shadow-md rounded-xl"
        >
          <Plus className="w-5 h-5" />
        </Button>
      )}
    </div>
  );
}
