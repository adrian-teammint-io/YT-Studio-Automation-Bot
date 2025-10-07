"use client";

import * as React from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ChevronDown } from "lucide-react";
import { DroppableSection } from "./components/DroppableSection";
import { TodoHeader } from "./components/TodoHeader";
import { TodoInput } from "./components/TodoInput";
import { ExportView } from "./components/ExportView";
import { DragOverlayPreview } from "./components/DragOverlayPreview";
import { TEXTAREA_MIN_HEIGHT, POPUP_WIDTH, POPUP_HEIGHT } from "./constants/ui";
import { availableCommands } from "./constants/commands";
import { Todo, Priority } from "./types/todo";
import { sortTodosByPriority } from "./utils/todo-sort";
import { generateMarkdown } from "./utils/markdown";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";

/**
 * Main todo popup component for Chrome extension.
 * Features:
 * - Drag-and-drop reordering
 * - Priority system (low/medium/high)
 * - Command mode (press : to activate)
 * - GitHub PR URL extraction
 * - Markdown export
 * - Chrome storage persistence
 */
export default function TodoPopup() {
  const [todos, setTodos] = React.useState<Todo[]>([]);
  const [inputValue, setInputValue] = React.useState("");
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [isExportView, setIsExportView] = React.useState(false);
  const [isCommandMode, setIsCommandMode] = React.useState(false);
  const [selectedCommandIndex, setSelectedCommandIndex] = React.useState(0);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Require 8px drag distance to distinguish from clicks
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Load todos from Chrome storage on mount
  React.useEffect(() => {
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.get(["todos"], (result) => {
        if (result.todos) {
          // Migrate old todos to include createdAt and priority fields
          const migratedTodos = result.todos.map((todo: Todo) => ({
            ...todo,
            createdAt: todo.createdAt || Date.now(),
            priority: todo.priority || "low",
          }));
          const sortedTodos = sortTodosByPriority(migratedTodos);
          setTodos(sortedTodos);
          // Save migrated todos back to storage
          chrome.storage.local.set({ todos: sortedTodos });
        }
      });
    }

    // Auto-focus input field when popup opens
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  const saveTodos = (newTodos: Todo[]) => {
    const sortedTodos = sortTodosByPriority(newTodos);
    setTodos(sortedTodos);
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.set({ todos: sortedTodos });
    }
  };

  const executeCommand = (command: string) => {
    const cmd = command.toLowerCase();

    if (cmd === "clear") {
      saveTodos([]);
    } else if (cmd === "markdown" || cmd === "export") {
      setIsExportView(true);
    }

    setInputValue("");
    setIsCommandMode(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = TEXTAREA_MIN_HEIGHT;
    }
  };

  const addTodo = () => {
    if (inputValue.trim()) {
      if (isCommandMode) {
        executeCommand(inputValue.trim());
        return;
      }

      const text = inputValue.trim();
      const now = Date.now();

      // Parse priority from text (e.g., "task /high" → high priority)
      let priority: Priority = "low";
      let cleanText = text;

      if (cleanText.includes("/high")) {
        priority = "high";
        cleanText = cleanText.replace(/\/high/g, "").trim();
      } else if (cleanText.includes("/medium")) {
        priority = "medium";
        cleanText = cleanText.replace(/\/medium/g, "").trim();
      } else if (cleanText.includes("/low")) {
        priority = "low";
        cleanText = cleanText.replace(/\/low/g, "").trim();
      }

      const newTodo: Todo = {
        id: now.toString(),
        text: cleanText,
        completed: false,
        createdAt: now,
        priority: priority,
      };
      saveTodos([...todos, newTodo]);
      setInputValue("");
      if (textareaRef.current) {
        textareaRef.current.style.height = TEXTAREA_MIN_HEIGHT;
      }
    }
  };

  // Auto-expand textarea as user types
  React.useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = TEXTAREA_MIN_HEIGHT;
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [inputValue]);

  /**
   * GitHub PR URL extraction - fetches PR title if on GitHub PR page.
   * Falls back to plain URL if not a PR or title extraction fails.
   */
  const pasteCurrentUrl = async () => {
    if (typeof chrome !== "undefined" && chrome.tabs) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab.url && tab.id) {
        const url = tab.url;
        const prMatch = url.match(/\/pull\/(\d+)/);

        if (prMatch) {
          const prNumber = prMatch[1];
          try {
            // Inject script to extract PR title from GitHub DOM
            const [result] = await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: () => {
                const titleElement = document.querySelector('.js-issue-title.markdown-title');
                return titleElement?.textContent?.trim() || null;
              }
            });
            const title = result?.result;

            // Format as markdown link with PR number and title
            if (title) {
              setInputValue(`[PR #${prNumber}: ${title}](${url})`);
            } else {
              setInputValue(`[PR #${prNumber}](${url})`);
            }
          } catch (error) {
            // Fallback if script injection fails
            setInputValue(`[PR #${prNumber}](${url})`);
          }
        } else {
          setInputValue(url);
        }
      }
    }
  };

  const exportToMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(generateMarkdown(todos));
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
    }
  };

  const toggleTodo = (id: string) => {
    const newTodos = todos.map((todo) => {
      if (todo.id === id) {
        return { ...todo, completed: !todo.completed };
      }
      return todo;
    });
    saveTodos(newTodos);
  };

  const deleteTodo = (id: string) => {
    const newTodos = todos.filter((todo) => todo.id !== id);
    saveTodos(newTodos);
  };

  const editTodo = (id: string, newText: string) => {
    const newTodos = todos.map((todo) => {
      if (todo.id === id) {
        return { ...todo, text: newText };
      }
      return todo;
    });
    saveTodos(newTodos);
  };

  const changePriority = (id: string, priority: Priority) => {
    const newTodos = todos.map((todo) => {
      if (todo.id === id) {
        return { ...todo, priority };
      }
      return todo;
    });
    saveTodos(newTodos);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const oldIndex = todos.findIndex((t) => t.id === activeId);
    const newIndex = todos.findIndex((t) => t.id === overId);

    if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
      const newTodos = arrayMove(todos, oldIndex, newIndex);
      saveTodos(newTodos);
    }
  };

  const activeTodo = todos.find((todo) => todo.id === activeId);
  const totalCount = todos.length;

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(generateMarkdown(todos));
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
    }
  };

  // Auto-focus input when returning from export view
  React.useEffect(() => {
    if (!isExportView && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isExportView]);

  if (isExportView) {
    return (
      <ExportView
        markdown={generateMarkdown(todos)}
        onBack={() => setIsExportView(false)}
        onCopy={copyMarkdown}
      />
    );
  }

  return (
    <div className="dark bg-transparent" style={{ width: POPUP_WIDTH, height: POPUP_HEIGHT }}>
      <div className="h-full flex flex-col p-4">
        <Card className="flex-1 flex flex-col shadow-xl border-border">
          <CardHeader className="space-y-2">
            <TodoHeader
              totalCount={totalCount}
              onExportToMarkdown={exportToMarkdown}
              onPasteCurrentUrl={pasteCurrentUrl}
            />

            <TodoInput
              value={inputValue}
              onChange={setInputValue}
              onSubmit={addTodo}
              isCommandMode={isCommandMode}
              onToggleCommandMode={() => {
                setIsCommandMode(!isCommandMode);
                setInputValue("");
                setSelectedCommandIndex(0);
              }}
              commands={availableCommands}
              selectedCommandIndex={selectedCommandIndex}
              onNavigateCommands={(direction) => {
                if (direction === "next") {
                  const nextIndex = (selectedCommandIndex + 1) % availableCommands.length;
                  setSelectedCommandIndex(nextIndex);
                  setInputValue(availableCommands[nextIndex].name);
                } else {
                  const prevIndex = (selectedCommandIndex - 1 + availableCommands.length) % availableCommands.length;
                  setSelectedCommandIndex(prevIndex);
                  setInputValue(availableCommands[prevIndex].name);
                }
              }}
              onSelectCommand={setInputValue}
              onEscape={() => {
                setIsCommandMode(false);
                setInputValue("");
                setSelectedCommandIndex(0);
              }}
              textareaRef={textareaRef}
            />
          </CardHeader>

          <div className="px-6 relative flex items-center justify-center">
            <div className="absolute inset-x-0 h-[2px] bg-border" />
            <div className="relative bg-background px-2">
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            </div>
          </div>

          <CardContent className="flex-1 flex flex-col pb-4 transition-all duration-200">
            <DndContext
              sensors={sensors}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <div className="flex-1 flex flex-col overflow-hidden transition-all duration-200">
                <DroppableSection
                  id="main-section"
                  todos={todos}
                  onToggle={toggleTodo}
                  onDelete={deleteTodo}
                  onEdit={editTodo}
                  onPriorityChange={changePriority}
                />
              </div>

              <DragOverlay>
                {activeId && activeTodo && <DragOverlayPreview todo={activeTodo} />}
              </DragOverlay>
            </DndContext>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
