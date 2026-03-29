import { useEffect } from "react";

interface ShortcutHandlers {
  onUndo?: () => void;
  onRedo?: () => void;
  onEscape?: () => void;
  onEnterSave?: () => void;
}

/**
 * Global keyboard shortcuts:
 * - Ctrl+Z / Cmd+Z: Undo
 * - Ctrl+Shift+Z / Cmd+Shift+Z (or Ctrl+Y): Redo
 * - Escape: Collapse/cancel
 * - Ctrl+Enter / Cmd+Enter: Save
 *
 * Enter-to-save uses Ctrl+Enter to avoid conflicting with normal typing in
 * textareas and inputs. Escape and undo/redo are suppressed when the user
 * is focused on an input/textarea (except Escape, which always works).
 */
export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable;

      // Escape — always works, even in inputs
      if (e.key === "Escape" && handlers.onEscape) {
        handlers.onEscape();
        return;
      }

      // Ctrl+Enter / Cmd+Enter — save
      if (e.key === "Enter" && mod && handlers.onEnterSave) {
        e.preventDefault();
        handlers.onEnterSave();
        return;
      }

      // Don't intercept undo/redo when user is typing in an input
      // (let the browser handle native undo in text fields)
      if (isInput) return;

      // Ctrl+Z / Cmd+Z — undo
      if (e.key === "z" && mod && !e.shiftKey && handlers.onUndo) {
        e.preventDefault();
        handlers.onUndo();
        return;
      }

      // Ctrl+Shift+Z / Cmd+Shift+Z or Ctrl+Y — redo
      if (
        ((e.key === "z" || e.key === "Z") && mod && e.shiftKey) ||
        (e.key === "y" && mod)
      ) {
        if (handlers.onRedo) {
          e.preventDefault();
          handlers.onRedo();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handlers]);
}
