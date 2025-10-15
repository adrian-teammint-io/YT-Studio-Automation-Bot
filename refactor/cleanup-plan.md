# Deep Cleanup Plan for popup.tsx

## Phase 1: Remove Dead Code ✓
- [x] Remove `CheckCircle2` import (unused)
- [x] Remove `DragOverEvent` import (unused)
- [x] Remove `completedCount` variable (unused)
- [x] Remove `Todo.status` field (always "all", never read)
- [x] Remove commented Checkbox import
- [x] Remove unused `label` from priorityConfig

## Phase 2: Consolidate Duplications ✓
- [x] Create single `generateMarkdown` util, remove duplication
- [x] Extract `PriorityDropdown` component (3 items × 15 lines = 45 lines saved)
- [x] Create constant for TEXTAREA_MIN_HEIGHT = "44px"

## Phase 3: Split Complex Components ✓
- [x] Extract `TodoItemEditMode` component (edit mode UI)
- [x] Extract `TodoItemDisplayMode` component (display mode UI)
- [x] Simplify `SortableTodoItem` to switch between modes
- [x] Extract `CommandKeyboardHandler` hook

## Phase 4: Additional Extractions ✓
- [x] Extract `TodoItemDate` component (date display)
- [x] Extract `EmptyState` component (Sparkles + message)
- [x] Extract constants to separate file

## Expected Results:
- **File size**: 790 → ~450 lines (43% reduction)
- **Complexity**: High → Medium
- **Reusability**: Low → High
- **Testability**: Poor → Good
