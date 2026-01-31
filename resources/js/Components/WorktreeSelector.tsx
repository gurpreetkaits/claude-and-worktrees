import { useState, useEffect, useMemo, useRef, useCallback, KeyboardEvent } from 'react';
import { Worktree, BrowseResponse, DirectoryEntry } from '@/types';
import { ChevronDownIcon, FolderIcon, GitBranchIcon, CheckIcon } from './ui/Icons';
import axios from 'axios';

interface WorktreeSelectorProps {
    worktrees: Worktree[];
    selectedWorktree: Worktree | null;
    onSelect: (worktree: Worktree | null) => void;
    onCreateWorktree?: (path: string, name: string, branch: string | null) => void;
    defaultProjectsPath?: string;
}

interface SelectableItem {
    id: string;
    type: 'gitRepo' | 'worktree' | 'directory';
    name: string;
    path: string;
    branch?: string | null;
    worktree?: Worktree;
    entry?: DirectoryEntry;
}

export function WorktreeSelector({
    worktrees,
    selectedWorktree,
    onSelect,
    onCreateWorktree,
    defaultProjectsPath,
}: WorktreeSelectorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [showBrowser, setShowBrowser] = useState(false);
    const [currentPath, setCurrentPath] = useState(defaultProjectsPath || '');
    const [entries, setEntries] = useState<DirectoryEntry[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [hasLoadedDefault, setHasLoadedDefault] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(0);

    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const browse = async (path?: string) => {
        setIsLoading(true);
        try {
            const response = await axios.get<BrowseResponse>('/api/browse', {
                params: { path },
            });
            setCurrentPath(response.data.path);
            setEntries(response.data.entries);
        } catch (error) {
            console.error('Failed to browse:', error);
        } finally {
            setIsLoading(false);
        }
    };

    // Auto-load default projects path on mount
    useEffect(() => {
        if (defaultProjectsPath && !hasLoadedDefault) {
            setHasLoadedDefault(true);
            browse(defaultProjectsPath);
        }
    }, [defaultProjectsPath, hasLoadedDefault]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Filter worktrees
    const filteredWorktrees = useMemo(() => {
        if (!query) return worktrees;
        const lowerQuery = query.toLowerCase();
        return worktrees.filter(
            (w) =>
                w.name.toLowerCase().includes(lowerQuery) ||
                w.path.toLowerCase().includes(lowerQuery)
        );
    }, [worktrees, query]);

    // All directories from the default path (not just git repos)
    const directoriesFromDefault = useMemo(() => {
        if (showBrowser) return [];
        return entries.filter((e) => e.name !== '..');
    }, [entries, showBrowser]);

    const filteredDirectories = useMemo(() => {
        if (!query) return directoriesFromDefault;
        const lowerQuery = query.toLowerCase();
        return directoriesFromDefault.filter((e) => e.name.toLowerCase().includes(lowerQuery));
    }, [directoriesFromDefault, query]);

    // Combined list of all selectable items for keyboard navigation
    const selectableItems: SelectableItem[] = useMemo(() => {
        if (showBrowser) return [];

        const items: SelectableItem[] = [];

        // Add directories from default path (git repos and regular directories)
        filteredDirectories.forEach((entry) => {
            items.push({
                id: `dir-${entry.path}`,
                type: entry.isGitRepo ? 'gitRepo' : 'directory',
                name: entry.name,
                path: entry.path,
                entry,
            });
        });

        // Add existing worktrees
        filteredWorktrees.forEach((worktree) => {
            items.push({
                id: `wt-${worktree.id}`,
                type: 'worktree',
                name: worktree.name,
                path: worktree.path,
                branch: worktree.branch,
                worktree,
            });
        });

        return items;
    }, [filteredDirectories, filteredWorktrees, showBrowser]);

    // Reset highlighted index when items change
    useEffect(() => {
        setHighlightedIndex(0);
    }, [selectableItems.length, isOpen]);

    // Scroll highlighted item into view
    useEffect(() => {
        if (isOpen && listRef.current) {
            const highlighted = listRef.current.querySelector(`[data-index="${highlightedIndex}"]`);
            if (highlighted) {
                highlighted.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [highlightedIndex, isOpen]);

    const handleSelectItem = useCallback((item: SelectableItem) => {
        if (item.type === 'gitRepo' && item.entry && onCreateWorktree) {
            onCreateWorktree(item.path, item.name, null);
            setIsOpen(false);
            setQuery('');
        } else if (item.type === 'directory' && item.entry) {
            // Navigate into the directory
            setShowBrowser(true);
            browse(item.path);
        } else if (item.type === 'worktree' && item.worktree) {
            onSelect(item.worktree);
            setIsOpen(false);
            setQuery('');
        }
    }, [onCreateWorktree, onSelect, browse]);

    const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {

        if (!isOpen) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
                setIsOpen(true);
                e.preventDefault();
            }
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                e.stopPropagation();
                setHighlightedIndex((prev) => {
                    const next = prev < selectableItems.length - 1 ? prev + 1 : prev;
                    return next;
                });
                break;
            case 'ArrowUp':
                e.preventDefault();
                e.stopPropagation();
                setHighlightedIndex((prev) => {
                    const next = prev > 0 ? prev - 1 : 0;
                    return next;
                });
                break;
            case 'Enter':
                e.preventDefault();
                e.stopPropagation();
                if (selectableItems[highlightedIndex]) {
                    handleSelectItem(selectableItems[highlightedIndex]);
                }
                break;
            case 'Escape':
                e.preventDefault();
                e.stopPropagation();
                setIsOpen(false);
                break;
        }
    }, [isOpen, selectableItems, highlightedIndex, handleSelectItem]);

    const filteredEntries = useMemo(() => {
        if (!query) return entries;
        const lowerQuery = query.toLowerCase();
        return entries.filter(
            (e) => e.name === '..' || e.name.toLowerCase().includes(lowerQuery)
        );
    }, [entries, query]);

    const handleSelectGitRepo = useCallback((entry: DirectoryEntry) => {
        if (onCreateWorktree) {
            const name = entry.path.split('/').pop() || 'Repository';
            onCreateWorktree(entry.path, name, null);
            setIsOpen(false);
            setQuery('');
        }
    }, [onCreateWorktree]);

    return (
        <div className="relative" ref={containerRef}>
            {/* Input */}
            <div className="relative">
                <input
                    ref={inputRef}
                    type="text"
                    className="input-field w-full pr-10"
                    value={isOpen ? query : (selectedWorktree?.name || '')}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        if (!isOpen) setIsOpen(true);
                        setHighlightedIndex(0);
                        if (e.target.value.startsWith('/') || e.target.value.startsWith('~')) {
                            setShowBrowser(true);
                            browse(e.target.value);
                        } else {
                            setShowBrowser(false);
                        }
                    }}
                    onFocus={() => {
                        setIsOpen(true);
                        setQuery('');
                        setHighlightedIndex(0);
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder="Select a repository..."
                />
                <button
                    type="button"
                    onClick={() => {
                        setIsOpen(!isOpen);
                        if (!isOpen) {
                            inputRef.current?.focus();
                        }
                    }}
                    className="absolute inset-y-0 right-0 flex items-center pr-3"
                    tabIndex={-1}
                >
                    <ChevronDownIcon className={`w-4 h-4 text-text-low transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
            </div>

            {/* Dropdown */}
            {isOpen && (
                <div
                    ref={listRef}
                    className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-lg bg-bg-primary border border-border shadow-lg"
                >
                    {/* Directories from default projects path */}
                    {!showBrowser && filteredDirectories.length > 0 && (
                        <div className="p-1">
                            <div className="px-2 py-1 text-xs font-medium text-text-low uppercase">
                                {currentPath.split('/').pop() || 'Default Path'}
                            </div>
                            {filteredDirectories.map((entry, idx) => {
                                const itemIndex = idx;
                                const isHighlighted = highlightedIndex === itemIndex;
                                return (
                                    <div
                                        key={entry.path}
                                        data-index={itemIndex}
                                        role="button"
                                        tabIndex={0}
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            if (entry.isGitRepo) {
                                                handleSelectGitRepo(entry);
                                            } else {
                                                setShowBrowser(true);
                                                browse(entry.path);
                                            }
                                        }}
                                        onMouseEnter={() => setHighlightedIndex(itemIndex)}
                                        onMouseDown={(e) => {
                                            // Prevent focus change that might close dropdown
                                            e.preventDefault();
                                        }}
                                        className={`w-full flex items-center gap-3 px-3 py-2 cursor-pointer rounded-md text-left ${
                                            isHighlighted ? 'bg-bg-panel' : 'hover:bg-bg-panel'
                                        }`}
                                    >
                                        <FolderIcon className={`w-4 h-4 flex-shrink-0 ${entry.isGitRepo ? 'text-brand' : 'text-text-low'}`} />
                                        <div className="flex-1 min-w-0">
                                            <div className={`font-medium truncate ${entry.isHidden ? 'text-text-low' : 'text-text-high'}`}>
                                                {entry.name}
                                            </div>
                                            <div className="text-xs text-text-low font-mono truncate">
                                                {entry.path}
                                            </div>
                                        </div>
                                        {entry.isGitRepo ? (
                                            <span className="flex items-center gap-1 text-xs text-brand bg-brand/10 px-2 py-0.5 rounded">
                                                <GitBranchIcon className="w-3 h-3" />
                                                git
                                            </span>
                                        ) : (
                                            <ChevronDownIcon className="w-4 h-4 text-text-low -rotate-90" />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Existing worktrees */}
                    {!showBrowser && filteredWorktrees.length > 0 && (
                        <div className={`p-1 ${filteredDirectories.length > 0 ? 'border-t border-border' : ''}`}>
                            <div className="px-2 py-1 text-xs font-medium text-text-low uppercase">
                                Recent Worktrees
                            </div>
                            {filteredWorktrees.map((worktree, idx) => {
                                const itemIndex = filteredDirectories.length + idx;
                                const isHighlighted = highlightedIndex === itemIndex;
                                return (
                                    <div
                                        key={worktree.id}
                                        data-index={itemIndex}
                                        role="button"
                                        tabIndex={0}
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            onSelect(worktree);
                                            setIsOpen(false);
                                            setQuery('');
                                        }}
                                        onMouseEnter={() => setHighlightedIndex(itemIndex)}
                                        onMouseDown={(e) => {
                                            // Prevent focus change that might close dropdown
                                            e.preventDefault();
                                        }}
                                        className={`w-full flex items-center gap-3 px-3 py-2 cursor-pointer rounded-md text-left ${
                                            isHighlighted ? 'bg-bg-panel' : 'hover:bg-bg-panel'
                                        }`}
                                    >
                                        <FolderIcon className="w-4 h-4 text-brand flex-shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium text-text-high truncate">
                                                {worktree.name}
                                            </div>
                                            <div className="text-xs text-text-low font-mono truncate">
                                                {worktree.path}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="flex items-center gap-1 text-xs text-text-low">
                                                <GitBranchIcon className="w-3 h-3" />
                                                {worktree.branch || 'main'}
                                            </span>
                                            {selectedWorktree?.id === worktree.id && (
                                                <CheckIcon className="w-4 h-4 text-brand" />
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Browse option */}
                    {!showBrowser && (
                        <div className="border-t border-border p-1">
                            <div
                                role="button"
                                tabIndex={0}
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setShowBrowser(true);
                                    browse(defaultProjectsPath);
                                }}
                                onMouseDown={(e) => e.preventDefault()}
                                className="w-full flex items-center gap-3 px-3 py-2 text-left rounded-md hover:bg-bg-panel text-text-normal cursor-pointer"
                            >
                                <FolderIcon className="w-4 h-4 text-text-low" />
                                <span>Browse other locations...</span>
                            </div>
                        </div>
                    )}

                    {/* Directory browser */}
                    {showBrowser && (
                        <div className="p-1">
                            <div className="px-2 py-1 text-xs font-medium text-text-low flex items-center justify-between">
                                <span className="font-mono truncate">{currentPath || '/'}</span>
                                <button
                                    type="button"
                                    onClick={() => setShowBrowser(false)}
                                    className="text-brand hover:underline"
                                >
                                    Back
                                </button>
                            </div>
                            {isLoading ? (
                                <div className="px-3 py-4 text-center text-text-low">
                                    Loading...
                                </div>
                            ) : (
                                filteredEntries.map((entry) => (
                                    <div
                                        key={entry.path}
                                        className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-bg-panel"
                                    >
                                        <FolderIcon
                                            className={`w-4 h-4 flex-shrink-0 ${
                                                entry.isGitRepo ? 'text-brand' : 'text-text-low'
                                            }`}
                                        />
                                        <div
                                            role="button"
                                            tabIndex={0}
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                browse(entry.path);
                                            }}
                                            onMouseDown={(e) => e.preventDefault()}
                                            className={`flex-1 text-left truncate font-mono text-sm cursor-pointer ${
                                                entry.isHidden ? 'text-text-low' : 'text-text-high'
                                            } hover:text-brand`}
                                        >
                                            {entry.name}
                                        </div>
                                        {entry.isGitRepo && onCreateWorktree && (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    handleSelectGitRepo(entry);
                                                }}
                                                onMouseDown={(e) => e.preventDefault()}
                                                className="flex items-center gap-1 text-xs text-on-brand bg-brand hover:bg-brand-hover px-2 py-1 rounded transition-colors"
                                            >
                                                Select
                                            </button>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {/* No results */}
                    {!showBrowser && filteredWorktrees.length === 0 && filteredDirectories.length === 0 && (
                        <div className="px-3 py-4 text-center text-text-low">
                            {query ? 'No repositories found' : 'No repositories available'}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
