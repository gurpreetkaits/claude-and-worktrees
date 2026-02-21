import { useState, useEffect, useMemo } from 'react';
import { BrowseResponse, DirectoryEntry } from '@/types';
import { FolderIcon, GitBranchIcon, ChevronRightIcon } from './ui/Icons';
import axios from 'axios';

interface DirectoryBrowserProps {
    onSelect: (path: string, name: string, branch: string | null) => void;
    onCancel: () => void;
}

export function DirectoryBrowser({ onSelect, onCancel }: DirectoryBrowserProps) {
    const [currentPath, setCurrentPath] = useState('');
    const [entries, setEntries] = useState<DirectoryEntry[]>([]);
    const [isGitRepo, setIsGitRepo] = useState(false);
    const [currentBranch, setCurrentBranch] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [showHidden, setShowHidden] = useState(false);
    const [search, setSearch] = useState('');

    const browse = async (path?: string) => {
        setLoading(true);
        try {
            const response = await axios.get<BrowseResponse>('/api/browse', {
                params: { path },
            });
            setCurrentPath(response.data.path);
            setEntries(response.data.entries);
            setIsGitRepo(response.data.isGitRepo);
            setCurrentBranch(response.data.currentBranch);
            setSearch('');
        } catch (error) {
            console.error('Failed to browse:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        browse();
    }, []);

    const handleSearchChange = (value: string) => {
        setSearch(value);

        // If input looks like a path, try to navigate
        if (value.includes('/')) {
            let targetPath = value;

            // Handle relative paths
            if (!value.startsWith('/')) {
                targetPath = currentPath === '/' ? `/${value}` : `${currentPath}/${value}`;
            }

            // Remove trailing slash for navigation
            targetPath = targetPath.replace(/\/+$/, '') || '/';

            // Debounce navigation
            const timer = setTimeout(() => {
                browse(targetPath);
            }, 300);

            return () => clearTimeout(timer);
        }
    };

    const handleSearchKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && search.trim()) {
            let targetPath = search.trim();

            if (!targetPath.startsWith('/')) {
                targetPath = currentPath === '/' ? `/${targetPath}` : `${currentPath}/${targetPath}`;
            }

            browse(targetPath);
        }
    };

    const filteredEntries = useMemo(() => {
        let result = entries;

        // Filter hidden files
        if (!showHidden) {
            result = result.filter((e) => !e.isHidden || e.name === '..');
        }

        // Filter by search (only if not a path)
        if (search.trim() && !search.includes('/')) {
            const searchLower = search.toLowerCase();
            result = result.filter(
                (e) => e.name === '..' || e.name.toLowerCase().includes(searchLower)
            );
        }

        return result;
    }, [entries, showHidden, search]);

    const handleSelect = () => {
        const name = currentPath.split('/').pop() || 'Repository';
        onSelect(currentPath, name, currentBranch);
    };

    const pathParts = currentPath.split('/').filter(Boolean);

    return (
        <div className="bg-bg border border-border rounded-lg overflow-hidden">
            {/* Search/Path input */}
            <div className="p-3 border-b border-border">
                <input
                    type="text"
                    value={search}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    placeholder="Search or type path (e.g. Users/code)..."
                    className="w-full px-3 py-2 bg-bg border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring text-fg placeholder:text-fg-muted text-sm font-mono"
                    autoFocus
                />
            </div>

            {/* Breadcrumb */}
            <div className="px-3 py-2 border-b border-border bg-bg-secondary">
                <div className="flex items-center gap-1 text-sm font-mono overflow-x-auto text-fg">
                    <button
                        onClick={() => browse('/')}
                        className="hover:text-fg px-1"
                    >
                        /
                    </button>
                    {pathParts.map((part, index) => (
                        <span key={index} className="flex items-center">
                            <ChevronRightIcon className="w-3 h-3 text-fg-muted flex-shrink-0" />
                            <button
                                onClick={() =>
                                    browse('/' + pathParts.slice(0, index + 1).join('/'))
                                }
                                className="hover:text-fg px-1 truncate max-w-[150px]"
                            >
                                {part}
                            </button>
                        </span>
                    ))}
                </div>
            </div>

            {/* Directory listing */}
            <div className="max-h-[280px] overflow-y-auto scrollbar-thin">
                {loading ? (
                    <div className="p-4 text-center text-fg-muted text-sm">Loading...</div>
                ) : filteredEntries.length === 0 ? (
                    <div className="p-4 text-center text-fg-muted text-sm">
                        {search ? 'No folders match' : 'Empty directory'}
                    </div>
                ) : (
                    <div className="divide-y divide-border">
                        {filteredEntries.map((entry) => (
                            <button
                                key={entry.path}
                                onClick={() => browse(entry.path)}
                                className="w-full px-3 py-2 flex items-center gap-3 hover:bg-bg-muted text-left transition-colors"
                            >
                                <FolderIcon
                                    className={`w-4 h-4 flex-shrink-0 ${
                                        entry.isGitRepo
                                            ? 'text-fg'
                                            : 'text-fg-muted'
                                    }`}
                                />
                                <span
                                    className={`flex-1 truncate font-mono text-sm ${
                                        entry.isHidden ? 'text-fg-muted' : 'text-fg'
                                    }`}
                                >
                                    {entry.name}
                                </span>
                                {entry.isGitRepo && (
                                    <span className="flex items-center gap-1 text-xs text-fg bg-fg/10 px-2 py-0.5 rounded">
                                        <GitBranchIcon className="w-3 h-3" />
                                        git
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-border bg-bg-secondary">
                <div className="flex items-center justify-between mb-3">
                    <label className="flex items-center gap-2 text-sm text-fg-muted">
                        <input
                            type="checkbox"
                            checked={showHidden}
                            onChange={(e) => setShowHidden(e.target.checked)}
                            className="rounded border-border bg-bg"
                        />
                        Show hidden
                    </label>
                    {isGitRepo && (
                        <span className="flex items-center gap-1 text-sm text-fg">
                            <GitBranchIcon className="w-4 h-4" />
                            {currentBranch || 'detached'}
                        </span>
                    )}
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handleSelect}
                        disabled={!isGitRepo}
                        className="flex-1 py-2 text-sm font-medium rounded-md bg-fg text-accent-fg hover:opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isGitRepo ? 'Select Repository' : 'Not a Git Repository'}
                    </button>
                    <button onClick={onCancel} className="px-4 py-2 text-sm font-medium rounded-md bg-bg-secondary border border-border text-fg hover:bg-bg-muted transition-colors">
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}
