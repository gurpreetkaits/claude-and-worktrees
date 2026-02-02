import { useState, useCallback } from 'react';
import { Worktree } from '@/types';
import { FolderIcon, GitBranchIcon, ChevronDownIcon } from './ui/Icons';
import { FolderPickerDialog } from './FolderPickerDialog';

interface WorktreeSelectorProps {
    worktrees: Worktree[];
    selectedWorktree: Worktree | null;
    onSelect: (worktree: Worktree | null) => void;
    onCreateWorktree?: (path: string, name: string, branch: string | null) => void;
    defaultProjectsPath?: string;
}

export function WorktreeSelector({
    worktrees,
    selectedWorktree,
    onSelect,
    onCreateWorktree,
    defaultProjectsPath,
}: WorktreeSelectorProps) {
    const [showFolderPicker, setShowFolderPicker] = useState(false);

    const handleBrowse = useCallback(() => {
        setShowFolderPicker(true);
    }, []);

    const handleSelectFromPicker = useCallback((path: string, name: string, branch: string | null) => {
        // Check if this path matches an existing worktree
        const existingWorktree = worktrees.find(w => w.path === path);

        if (existingWorktree) {
            onSelect(existingWorktree);
        } else if (onCreateWorktree) {
            // Create a new worktree for this path
            onCreateWorktree(path, name, branch);
        }
    }, [worktrees, onSelect, onCreateWorktree]);

    return (
        <>
            {/* Trigger Button */}
            <button
                type="button"
                onClick={handleBrowse}
                className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-sm bg-bg-secondary border border-border/50 rounded-lg hover:border-border focus:outline-none focus:border-brand/50 transition-colors"
            >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    <FolderIcon className={`w-4 h-4 flex-shrink-0 ${selectedWorktree ? 'text-brand' : 'text-text-low'}`} />
                    {selectedWorktree ? (
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="truncate text-text-high font-medium">
                                {selectedWorktree.name}
                            </span>
                            {selectedWorktree.branch && (
                                <span className="flex items-center gap-1 text-xs text-text-low flex-shrink-0">
                                    <GitBranchIcon className="w-3 h-3" />
                                    {selectedWorktree.branch}
                                </span>
                            )}
                        </div>
                    ) : (
                        <span className="truncate text-text-low/70">
                            Select repository...
                        </span>
                    )}
                </div>
                <ChevronDownIcon className="w-4 h-4 text-text-low flex-shrink-0" />
            </button>

            {/* Folder Picker Dialog */}
            <FolderPickerDialog
                show={showFolderPicker}
                initialPath={selectedWorktree?.path || defaultProjectsPath || ''}
                onSelect={handleSelectFromPicker}
                onClose={() => setShowFolderPicker(false)}
            />
        </>
    );
}
