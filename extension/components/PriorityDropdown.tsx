import * as React from "react";
import { Button } from "@/components/ui/button";
import { Flag } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Priority = "low" | "medium" | "high";

interface PriorityDropdownProps {
  onPriorityChange: (priority: Priority) => void;
}

const priorityOptions: { value: Priority; label: string; color: string }[] = [
  { value: "low", label: "Low", color: "bg-blue-500" },
  { value: "medium", label: "Medium", color: "bg-yellow-500" },
  { value: "high", label: "High", color: "bg-red-500" },
];

export function PriorityDropdown({ onPriorityChange }: PriorityDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => e.stopPropagation()}
          className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 p-0 hover:bg-accent pointer-events-auto"
        >
          <Flag className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {priorityOptions.map(({ value, label, color }) => (
          <DropdownMenuItem
            key={value}
            onClick={(e) => {
              e.stopPropagation();
              onPriorityChange(value);
            }}
            className="cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${color}`} />
              {label}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
