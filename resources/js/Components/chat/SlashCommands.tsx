import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { TerminalIcon, SearchIcon, FileIcon, EditIcon, GitBranchIcon, RefreshIcon, BrainIcon, CodeIcon } from '../ui/Icons';

// Slash command definition
export interface SlashCommand {
    name: string;
    description: string;
    icon?: typeof TerminalIcon;
    category?: 'general' | 'git' | 'code' | 'session';
}

// Built-in slash commands
export const SLASH_COMMANDS: SlashCommand[] = [
    // General commands
    { name: 'help', description: 'Show available commands', icon: TerminalIcon, category: 'general' },
    { name: 'clear', description: 'Clear the conversation', icon: RefreshIcon, category: 'general' },
    { name: 'compact', description: 'Summarize conversation history', icon: BrainIcon, category: 'session' },

    // Code commands
    { name: 'search', description: 'Search files in the project', icon: SearchIcon, category: 'code' },
    { name: 'read', description: 'Read a specific file', icon: FileIcon, category: 'code' },
    { name: 'edit', description: 'Edit a specific file', icon: EditIcon, category: 'code' },
    { name: 'review', description: 'Review code changes', icon: CodeIcon, category: 'code' },

    // Git commands
    { name: 'status', description: 'Show git status', icon: GitBranchIcon, category: 'git' },
    { name: 'diff', description: 'Show git diff', icon: GitBranchIcon, category: 'git' },
    { name: 'commit', description: 'Commit changes with AI message', icon: GitBranchIcon, category: 'git' },
    { name: 'pr', description: 'Create a pull request', icon: GitBranchIcon, category: 'git' },

    // Session commands
    { name: 'cost', description: 'Show session cost and tokens', icon: BrainIcon, category: 'session' },
    { name: 'context', description: 'Show context usage', icon: BrainIcon, category: 'session' },
];

// Filter and rank commands based on query
function filterCommands(commands: SlashCommand[], query: string): SlashCommand[] {
    if (!query) return commands;

    const lowerQuery = query.toLowerCase();

    // Split into "starts with" and "contains" matches
    const startsWithMatches: SlashCommand[] = [];
    const containsMatches: SlashCommand[] = [];

    for (const cmd of commands) {
        const lowerName = cmd.name.toLowerCase();
        const lowerDesc = cmd.description.toLowerCase();

        if (lowerName.startsWith(lowerQuery)) {
            startsWithMatches.push(cmd);
        } else if (lowerName.includes(lowerQuery) || lowerDesc.includes(lowerQuery)) {
            containsMatches.push(cmd);
        }
    }

    // Prioritize starts-with matches
    return [...startsWithMatches, ...containsMatches].slice(0, 10);
}

// Detect slash command in input
export function detectSlashCommand(input: string): { isCommand: boolean; query: string; fullMatch: string } | null {
    // Match / at start or after whitespace, followed by optional command text
    const match = input.match(/(?:^|\s)\/([^\s]*)$/);
    if (!match) return null;

    return {
        isCommand: true,
        query: match[1] || '',
        fullMatch: match[0],
    };
}

// Props for the typeahead menu
interface SlashCommandMenuProps {
    query: string;
    onSelect: (command: SlashCommand) => void;
    onClose: () => void;
    selectedIndex: number;
    onSelectedIndexChange: (index: number) => void;
    className?: string;
}

export function SlashCommandMenu({
    query,
    onSelect,
    onClose,
    selectedIndex,
    onSelectedIndexChange,
    className,
}: SlashCommandMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);
    const filteredCommands = useMemo(() => filterCommands(SLASH_COMMANDS, query), [query]);

    // Handle keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                onSelectedIndexChange(Math.min(selectedIndex + 1, filteredCommands.length - 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                onSelectedIndexChange(Math.max(selectedIndex - 1, 0));
            } else if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            } else if (e.key === 'Tab' && filteredCommands[selectedIndex]) {
                // Tab to autocomplete the selected command
                e.preventDefault();
                onSelect(filteredCommands[selectedIndex]);
            }
            // Note: Enter is NOT handled here - it submits the message directly
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedIndex, filteredCommands, onSelect, onClose, onSelectedIndexChange]);

    // Scroll selected item into view
    useEffect(() => {
        const menu = menuRef.current;
        if (!menu) return;

        const selectedItem = menu.querySelector(`[data-index="${selectedIndex}"]`);
        if (selectedItem) {
            selectedItem.scrollIntoView({ block: 'nearest' });
        }
    }, [selectedIndex]);

    // Reset selection when query changes
    useEffect(() => {
        onSelectedIndexChange(0);
    }, [query, onSelectedIndexChange]);

    if (filteredCommands.length === 0) {
        return (
            <div className={cn(
                'absolute bottom-full left-0 mb-2 w-72 bg-bg border border-border rounded-lg shadow-xl overflow-hidden z-50',
                className
            )}>
                <div className="px-3 py-2 text-sm text-fg-muted">
                    No commands found
                </div>
            </div>
        );
    }

    // Group commands by category
    const groupedCommands = useMemo(() => {
        const groups: Record<string, SlashCommand[]> = {};
        filteredCommands.forEach(cmd => {
            const category = cmd.category || 'general';
            if (!groups[category]) groups[category] = [];
            groups[category].push(cmd);
        });
        return groups;
    }, [filteredCommands]);

    const categoryLabels: Record<string, string> = {
        general: 'General',
        code: 'Code',
        git: 'Git',
        session: 'Session',
    };

    let globalIndex = 0;

    return (
        <div
            ref={menuRef}
            className={cn(
                'absolute bottom-full left-0 mb-2 w-80 bg-bg border border-border rounded-xl shadow-xl overflow-hidden z-50',
                className
            )}
        >
            {/* Header */}
            <div className="px-3 py-2 border-b border-border bg-bg-secondary flex items-center gap-2">
                <TerminalIcon className="w-4 h-4 text-fg-muted" />
                <span className="text-xs font-medium text-fg-muted uppercase tracking-wider">Commands</span>
            </div>

            {/* Commands list */}
            <div className="max-h-64 overflow-y-auto">
                {Object.entries(groupedCommands).map(([category, commands]) => (
                    <div key={category}>
                        {/* Category header - only show if filtering shows multiple categories */}
                        {Object.keys(groupedCommands).length > 1 && (
                            <div className="px-3 py-1.5 text-[10px] font-semibold text-fg-muted uppercase tracking-wider bg-bg-secondary">
                                {categoryLabels[category] || category}
                            </div>
                        )}

                        {commands.map((command) => {
                            const currentIndex = globalIndex++;
                            const Icon = command.icon || TerminalIcon;
                            const isSelected = currentIndex === selectedIndex;

                            return (
                                <div
                                    key={command.name}
                                    data-index={currentIndex}
                                    onClick={() => onSelect(command)}
                                    className={cn(
                                        'flex items-start gap-2 px-3 py-2 cursor-pointer transition-colors',
                                        isSelected
                                            ? 'bg-bg-muted border-l-2 border-fg-muted'
                                            : 'hover:bg-bg-muted border-l-2 border-transparent'
                                    )}
                                >
                                    <Icon className={cn(
                                        'w-4 h-4 mt-0.5 flex-shrink-0',
                                        isSelected ? 'text-fg-secondary' : 'text-fg-muted'
                                    )} />
                                    <div className="flex-1 min-w-0">
                                        <div className={cn(
                                            'text-sm font-mono',
                                            isSelected ? 'text-fg' : 'text-fg-secondary'
                                        )}>
                                            /{command.name}
                                        </div>
                                        <div className="text-xs text-fg-muted truncate">
                                            {command.description}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>

            {/* Footer hint */}
            <div className="px-3 py-1.5 border-t border-border bg-bg-secondary text-[10px] text-fg-muted flex items-center gap-3">
                <span><kbd className="px-1 py-0.5 bg-bg-muted rounded text-[9px]">↑↓</kbd> navigate</span>
                <span><kbd className="px-1 py-0.5 bg-bg-muted rounded text-[9px]">Tab</kbd> complete</span>
                <span><kbd className="px-1 py-0.5 bg-bg-muted rounded text-[9px]">Enter</kbd> send</span>
                <span><kbd className="px-1 py-0.5 bg-bg-muted rounded text-[9px]">Esc</kbd> close</span>
            </div>
        </div>
    );
}

// Hook to manage slash command state
export function useSlashCommands(
    input: string,
    onCommandSelect: (command: SlashCommand, input: string) => void
) {
    const [showMenu, setShowMenu] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [commandMatch, setCommandMatch] = useState<ReturnType<typeof detectSlashCommand>>(null);

    // Detect slash command in input
    useEffect(() => {
        const match = detectSlashCommand(input);
        setCommandMatch(match);
        setShowMenu(!!match);

        if (!match) {
            setSelectedIndex(0);
        }
    }, [input]);

    // Handle command selection
    const handleSelect = useCallback((command: SlashCommand) => {
        if (!commandMatch) return;

        // Replace the slash command portion with the full command
        const beforeSlash = input.slice(0, input.length - commandMatch.fullMatch.length);
        const newInput = beforeSlash + `/${command.name} `;

        onCommandSelect(command, newInput);
        setShowMenu(false);
    }, [input, commandMatch, onCommandSelect]);

    const handleClose = useCallback(() => {
        setShowMenu(false);
    }, []);

    return {
        showMenu,
        selectedIndex,
        setSelectedIndex,
        query: commandMatch?.query || '',
        handleSelect,
        handleClose,
    };
}
