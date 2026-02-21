import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogPanel } from '@headlessui/react';
import { BrowseResponse, DirectoryEntry } from '@/types';
import { XIcon, FolderIcon, FolderOpenIcon, HomeIcon, ChevronUpIcon, SearchIcon, GitBranchIcon, FileIcon } from './ui/Icons';
import axios from 'axios';

interface FolderPickerDialogProps {
    show: boolean;
    initialPath?: string;
    title?: string;
    description?: string;
    onSelect: (path: string, name: string, branch: string | null) => void;
    onClose: () => void;
}

export function FolderPickerDialog({
    show,
    initialPath = '',
    title = 'Select Repository',
    description = 'Choose a git repository for your task',
    onSelect,
    onClose,
}: FolderPickerDialogProps) {
    const [currentPath, setCurrentPath] = useState('');
    const [entries, setEntries] = useState<DirectoryEntry[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [manualPath, setManualPath] = useState(initialPath);
    const [searchTerm, setSearchTerm] = useState('');
    const [isGitRepo, setIsGitRepo] = useState(false);
    const [currentBranch, setCurrentBranch] = useState<string | null>(null);

    const filteredEntries = useMemo(() => {
        if (!searchTerm.trim()) return entries;
        return entries.filter((entry) =>
            entry.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [entries, searchTerm]);

    useEffect(() => {
        if (show) {
            setManualPath(initialPath);
            setSearchTerm('');
            loadDirectory(initialPath || undefined);
        }
    }, [show, initialPath]);

    const loadDirectory = async (path?: string) => {
        setIsLoading(true);
        setError('');

        try {
            const response = await axios.get<BrowseResponse>('/api/browse', {
                params: { path },
            });

            setEntries(response.data.entries || []);
            setCurrentPath(response.data.path || '');
            setIsGitRepo(response.data.isGitRepo);
            setCurrentBranch(response.data.currentBranch);

            if (path) {
                setManualPath(response.data.path || '');
            }
        } catch (err) {
            setError('Failed to load directory');
            setEntries([]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleFolderClick = (entry: DirectoryEntry) => {
        if (entry.isDirectory) {
            setSearchTerm('');
            loadDirectory(entry.path);
        }
    };

    const handleParentDirectory = () => {
        const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
        loadDirectory(parentPath);
    };

    const handleHomeDirectory = () => {
        loadDirectory();
    };

    const handleManualPathChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setManualPath(e.target.value);
    };

    const handleManualPathSubmit = () => {
        if (manualPath.trim()) {
            loadDirectory(manualPath.trim());
        }
    };

    const handleSelectCurrent = () => {
        if (isGitRepo) {
            const name = currentPath.split('/').pop() || 'Repository';
            onSelect(currentPath, name, currentBranch);
            onClose();
        }
    };

    const handleSelectEntry = (entry: DirectoryEntry) => {
        if (entry.isGitRepo) {
            const name = entry.path.split('/').pop() || 'Repository';
            onSelect(entry.path, name, null);
            onClose();
        } else if (entry.isDirectory) {
            handleFolderClick(entry);
        }
    };

    const handleOpenChange = (open: boolean) => {
        if (!open) {
            onClose();
        }
    };

    if (!show) return null;

    return (
        <div className="fixed inset-0 z-[10000] pointer-events-none [&>*]:pointer-events-auto">
            <Dialog as="div" className="relative z-[10000]" open={show} onClose={handleOpenChange}>
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />

                <div className="fixed inset-0 overflow-y-auto">
                    <div className="flex min-h-full items-center justify-center p-4">
                        <DialogPanel className="w-full max-w-[600px] transform overflow-hidden rounded-xl bg-bg border border-border shadow-2xl transition-all flex flex-col max-h-[700px]">
                            {/* Header */}
                            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                                <div>
                                    <h3 className="text-sm font-medium text-fg">{title}</h3>
                                    <p className="text-xs text-fg-muted mt-0.5">{description}</p>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-1 text-fg-muted hover:text-fg rounded transition-colors"
                                >
                                    <XIcon className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Content */}
                            <div className="flex-1 flex flex-col p-4 space-y-3 overflow-hidden">
                                {/* Legend */}
                                <div className="text-xs text-fg-muted border-b border-border pb-2 flex items-center gap-4">
                                    <span className="flex items-center gap-1.5">
                                        <FolderOpenIcon className="w-3.5 h-3.5 text-fg" />
                                        <span>Git repository</span>
                                    </span>
                                    <span className="flex items-center gap-1.5">
                                        <FolderIcon className="w-3.5 h-3.5 text-fg-muted" />
                                        <span>Directory</span>
                                    </span>
                                </div>

                                {/* Manual path input */}
                                <div className="space-y-2">
                                    <div className="text-xs font-medium text-fg-secondary">Path</div>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={manualPath}
                                            onChange={handleManualPathChange}
                                            onKeyDown={(e) => e.key === 'Enter' && handleManualPathSubmit()}
                                            placeholder="~/code/my-project"
                                            className="flex-1 px-3 py-2 text-sm bg-bg-secondary border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-ring text-fg placeholder:text-fg-muted min-w-0"
                                        />
                                        <button
                                            onClick={handleManualPathSubmit}
                                            className="px-3 py-2 text-xs font-medium bg-bg-muted border border-border rounded-lg hover:bg-bg-accent transition-colors text-fg-secondary flex-shrink-0"
                                        >
                                            Go
                                        </button>
                                    </div>
                                </div>

                                {/* Search */}
                                <div className="space-y-2">
                                    <div className="text-xs font-medium text-fg-secondary">Filter</div>
                                    <div className="relative">
                                        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted" />
                                        <input
                                            type="text"
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            placeholder="Filter folders and files..."
                                            className="w-full pl-9 pr-3 py-2 text-sm bg-bg-secondary border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-ring text-fg placeholder:text-fg-muted"
                                        />
                                    </div>
                                </div>

                                {/* Navigation */}
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleHomeDirectory}
                                        className="p-2 text-fg-muted hover:text-fg hover:bg-bg-muted rounded-lg transition-colors flex-shrink-0"
                                        title="Home"
                                    >
                                        <HomeIcon className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={handleParentDirectory}
                                        disabled={!currentPath || currentPath === '/'}
                                        className="p-2 text-fg-muted hover:text-fg hover:bg-bg-muted rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
                                        title="Parent directory"
                                    >
                                        <ChevronUpIcon className="w-4 h-4" />
                                    </button>
                                    <div className="flex-1 text-sm text-fg-muted truncate font-mono min-w-0">
                                        {currentPath || '~'}
                                    </div>
                                    {isGitRepo && (
                                        <button
                                            onClick={handleSelectCurrent}
                                            className="px-3 py-1.5 text-xs font-medium bg-fg text-accent-fg rounded-lg hover:opacity-90 transition-colors flex-shrink-0"
                                        >
                                            Select
                                        </button>
                                    )}
                                </div>

                                {/* Directory listing */}
                                <div className="flex-1 border border-border rounded-lg overflow-auto min-h-[200px]">
                                    {isLoading ? (
                                        <div className="p-4 text-center text-fg-muted text-sm">
                                            Loading...
                                        </div>
                                    ) : error ? (
                                        <div className="p-4 text-center text-error text-sm">
                                            {error}
                                        </div>
                                    ) : filteredEntries.length === 0 ? (
                                        <div className="p-4 text-center text-fg-muted text-sm">
                                            {searchTerm.trim() ? 'No matches found' : 'Empty directory'}
                                        </div>
                                    ) : (
                                        <div className="p-1">
                                            {filteredEntries.map((entry) => (
                                                <div
                                                    key={entry.path}
                                                    onClick={() => handleSelectEntry(entry)}
                                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer hover:bg-bg-muted transition-colors ${
                                                        !entry.isDirectory ? 'opacity-40 cursor-not-allowed' : ''
                                                    }`}
                                                    title={entry.name}
                                                >
                                                    {entry.isDirectory ? (
                                                        entry.isGitRepo ? (
                                                            <FolderOpenIcon className="w-4 h-4 flex-shrink-0 text-fg" />
                                                        ) : (
                                                            <FolderIcon className="w-4 h-4 flex-shrink-0 text-fg-muted" />
                                                        )
                                                    ) : (
                                                        <FileIcon className="w-4 h-4 flex-shrink-0 text-fg-muted" />
                                                    )}
                                                    <span className={`text-sm flex-1 truncate min-w-0 ${
                                                        entry.isHidden ? 'text-fg-muted' : 'text-fg'
                                                    }`}>
                                                        {entry.name}
                                                    </span>
                                                    {entry.isGitRepo && (
                                                        <span className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-fg bg-fg/10 rounded flex-shrink-0">
                                                            <GitBranchIcon className="w-3 h-3" />
                                                            git
                                                        </span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
                                <button
                                    onClick={onClose}
                                    className="px-4 py-2 text-sm font-medium text-fg-secondary hover:text-fg hover:bg-bg-muted rounded-lg transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </DialogPanel>
                    </div>
                </div>
            </Dialog>
        </div>
    );
}
