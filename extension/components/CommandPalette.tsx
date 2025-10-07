interface Command {
  name: string;
  description: string;
}

interface CommandPaletteProps {
  commands: Command[];
  selectedIndex: number;
  onSelectCommand: (name: string) => void;
}

/**
 * Command palette dropdown showing available commands.
 * Keyboard navigation: Ctrl+N/P
 */
export function CommandPalette({
  commands,
  selectedIndex,
  onSelectCommand,
}: CommandPaletteProps) {
  return (
    <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-yellow-500/30 rounded-lg shadow-lg p-2 space-y-1 animate-in fade-in slide-in-from-top-2 duration-200 z-50">
      {commands.map((cmd, index) => (
        <div
          key={cmd.name}
          className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer transition-colors ${
            index === selectedIndex
              ? "bg-accent text-accent-foreground"
              : "hover:bg-accent/50"
          }`}
          onClick={() => onSelectCommand(cmd.name)}
        >
          <span className="text-xs font-mono text-yellow-500">{cmd.name}</span>
          <span className="text-xs text-muted-foreground">- {cmd.description}</span>
        </div>
      ))}
    </div>
  );
}
