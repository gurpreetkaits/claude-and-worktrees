import { useEffect, useCallback, useRef, useState } from 'react';

// Keyboard shortcut actions
export type ShortcutAction =
    | 'NEW_TASK'
    | 'SEARCH'
    | 'SETTINGS'
    | 'NEXT_TASK'
    | 'PREV_TASK'
    | 'FOCUS_INPUT'
    | 'CANCEL_STREAM'
    | 'TOGGLE_CHANGES'
    | 'HELP';

interface ShortcutConfig {
    key: string;           // Single key or sequence like 'g s'
    action: ShortcutAction;
    description: string;
    modifiers?: {
        meta?: boolean;    // Cmd on Mac, Ctrl on Windows
        shift?: boolean;
        alt?: boolean;
    };
}

// Default shortcuts configuration
const DEFAULT_SHORTCUTS: ShortcutConfig[] = [
    { key: 'n', action: 'NEW_TASK', description: 'New task', modifiers: { meta: true } },
    { key: 'k', action: 'SEARCH', description: 'Search / Command palette', modifiers: { meta: true } },
    { key: ',', action: 'SETTINGS', description: 'Settings', modifiers: { meta: true } },
    { key: 'j', action: 'NEXT_TASK', description: 'Next task' },
    { key: 'k', action: 'PREV_TASK', description: 'Previous task' },
    { key: '/', action: 'FOCUS_INPUT', description: 'Focus message input' },
    { key: 'Escape', action: 'CANCEL_STREAM', description: 'Cancel / Close' },
    { key: 'g', action: 'TOGGLE_CHANGES', description: 'Toggle git changes panel' },
    { key: '?', action: 'HELP', description: 'Show keyboard shortcuts', modifiers: { shift: true } },
];

// Sequential shortcut sequences (vim-style)
const SHORTCUT_SEQUENCES: { sequence: string[]; action: ShortcutAction; description: string }[] = [
    { sequence: ['g', 'n'], action: 'NEW_TASK', description: 'Go to new task' },
    { sequence: ['g', 's'], action: 'SETTINGS', description: 'Go to settings' },
    { sequence: ['g', 'c'], action: 'TOGGLE_CHANGES', description: 'Go to changes' },
];

const SEQUENCE_TIMEOUT = 1500; // ms to complete a sequence

interface UseKeyboardShortcutsOptions {
    onAction: (action: ShortcutAction) => void;
    enabled?: boolean;
}

export function useKeyboardShortcuts({ onAction, enabled = true }: UseKeyboardShortcutsOptions) {
    const [sequenceBuffer, setSequenceBuffer] = useState<string[]>([]);
    const sequenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [showHelp, setShowHelp] = useState(false);

    // Clear sequence buffer
    const clearSequence = useCallback(() => {
        setSequenceBuffer([]);
        if (sequenceTimeoutRef.current) {
            clearTimeout(sequenceTimeoutRef.current);
            sequenceTimeoutRef.current = null;
        }
    }, []);

    // Check if we should ignore keyboard events (when typing in inputs)
    const shouldIgnoreEvent = useCallback((e: KeyboardEvent) => {
        const target = e.target as HTMLElement;
        const tagName = target.tagName.toLowerCase();
        const isEditable = target.isContentEditable;
        const isInput = tagName === 'input' || tagName === 'textarea' || tagName === 'select';

        // Don't ignore if it's a shortcut with meta/ctrl key
        if (e.metaKey || e.ctrlKey) {
            return false;
        }

        return isInput || isEditable;
    }, []);

    // Handle keyboard events
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (!enabled) return;
        if (shouldIgnoreEvent(e)) return;

        const key = e.key;

        // Check for single-key shortcuts with modifiers first
        for (const shortcut of DEFAULT_SHORTCUTS) {
            if (shortcut.key === key) {
                const needsMeta = shortcut.modifiers?.meta;
                const needsShift = shortcut.modifiers?.shift;
                const needsAlt = shortcut.modifiers?.alt;

                const metaMatch = needsMeta ? (e.metaKey || e.ctrlKey) : !(e.metaKey || e.ctrlKey);
                const shiftMatch = needsShift ? e.shiftKey : !shortcut.modifiers?.shift || !e.shiftKey;
                const altMatch = needsAlt ? e.altKey : !shortcut.modifiers?.alt || !e.altKey;

                if (metaMatch && shiftMatch && altMatch) {
                    // Special case: j/k without modifiers for task navigation
                    if ((key === 'j' || key === 'k') && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                        e.preventDefault();
                        onAction(shortcut.action);
                        clearSequence();
                        return;
                    }

                    // Other shortcuts with modifiers
                    if (needsMeta || needsShift || needsAlt) {
                        e.preventDefault();
                        onAction(shortcut.action);
                        clearSequence();
                        return;
                    }
                }
            }
        }

        // Handle Escape specially
        if (key === 'Escape') {
            if (sequenceBuffer.length > 0) {
                clearSequence();
            } else {
                onAction('CANCEL_STREAM');
            }
            return;
        }

        // Handle sequence shortcuts (no modifiers)
        if (!e.metaKey && !e.ctrlKey && !e.altKey) {
            // Add key to sequence buffer
            const newBuffer = [...sequenceBuffer, key.toLowerCase()];
            setSequenceBuffer(newBuffer);

            // Clear timeout and set new one
            if (sequenceTimeoutRef.current) {
                clearTimeout(sequenceTimeoutRef.current);
            }
            sequenceTimeoutRef.current = setTimeout(clearSequence, SEQUENCE_TIMEOUT);

            // Check if sequence matches
            for (const seq of SHORTCUT_SEQUENCES) {
                if (seq.sequence.length === newBuffer.length &&
                    seq.sequence.every((k, i) => k === newBuffer[i])) {
                    e.preventDefault();
                    onAction(seq.action);
                    clearSequence();
                    return;
                }
            }

            // Check if partial match (could still become a valid sequence)
            const hasPartialMatch = SHORTCUT_SEQUENCES.some(seq =>
                seq.sequence.slice(0, newBuffer.length).every((k, i) => k === newBuffer[i])
            );

            if (!hasPartialMatch && newBuffer.length > 1) {
                // No match possible, clear buffer
                clearSequence();
            }
        }
    }, [enabled, shouldIgnoreEvent, sequenceBuffer, onAction, clearSequence]);

    // Set up event listener
    useEffect(() => {
        if (!enabled) return;

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            if (sequenceTimeoutRef.current) {
                clearTimeout(sequenceTimeoutRef.current);
            }
        };
    }, [enabled, handleKeyDown]);

    return {
        sequenceBuffer,
        showHelp,
        setShowHelp,
        shortcuts: [...DEFAULT_SHORTCUTS, ...SHORTCUT_SEQUENCES.map(s => ({
            key: s.sequence.join(' '),
            action: s.action,
            description: s.description,
        }))],
    };
}

// Hook for specific shortcut actions
export function useShortcutAction(action: ShortcutAction, callback: () => void, enabled = true) {
    useKeyboardShortcuts({
        onAction: (a) => {
            if (a === action) callback();
        },
        enabled,
    });
}
