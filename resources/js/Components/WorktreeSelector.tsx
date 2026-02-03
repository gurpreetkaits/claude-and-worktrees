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
                className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-gray-300 dark:hover:border-gray-600 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-colors"
            >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    <FolderIcon className={`w-4 h-4 flex-shrink-0 ${selectedWorktree ? 'text-orange-500' : 'text-gray-400'}`} />
                    {selectedWorktree ? (
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="truncate text-gray-900 dark:text-gray-100 font-medium">
                                {selectedWorktree.name}
                            </span>
                            {selectedWorktree.branch && (
                                <span className="flex items-center gap-1 text-xs text-gray-500 flex-shrink-0">
                                    <GitBranchIcon className="w-3 h-3" />
                                    {selectedWorktree.branch}
                                </span>
                            )}
                        </div>
                    ) : (
                        <span className="truncate text-gray-400">
                            Select repository...
                        </span>
                    )}
                </div>
                <ChevronDownIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
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
