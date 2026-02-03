import { useState, useEffect } from 'react';
import { GitStatus, Worktree, Todo, TodoChange } from '@/types';
import { DiffViewer } from './ui/DiffViewer';
import { FileIcon, FilePlusIcon, FileMinusIcon, RefreshIcon, GitBranchIcon } from './ui/Icons';
import axios from 'axios';

interface ChangesPanelProps {
    worktree: Worktree;
    todo?: Todo;
    initialStatus: GitStatus[];
    initialDiff?: string;
}

export function ChangesPanel({ worktree, todo, initialStatus, initialDiff }: ChangesPanelProps) {
    const [status, setStatus] = useState<GitStatus[]>(initialStatus);
    const [diff, setDiff] = useState(initialDiff || '');
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [viewMode, setViewMode] = useState<'task' | 'worktree'>('task');

    // Task-specific changes
    const taskChanges = todo?.changes || [];
    const hasTaskChanges = taskChanges.length > 0;

    // Auto-select first file when task changes
    useEffect(() => {
        if (viewMode === 'task' && hasTaskChanges && taskChanges.length > 0) {
            const firstChange = taskChanges[0];
            setSelectedFile(firstChange.file_path);
            setDiff(firstChange.diff || '');
        } else if (viewMode === 'worktree' && status.length > 0) {
            setSelectedFile(null);
            setDiff('');
        }
    }, [todo?.id, viewMode]);

    const refreshStatus = async () => {
        setIsLoading(true);
        try {
            const response = await axios.get(route('worktrees.status', worktree.id));
            setStatus(response.data.status);
        } catch (error) {
            console.error('Failed to refresh status:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchDiff = async (file: string) => {
        try {
            const response = await axios.get(route('worktrees.diff', worktree.id), {
                params: { file },
            });
            setDiff(response.data.diff || response.data.stagedDiff || '');
        } catch (error) {
            console.error('Failed to fetch diff:', error);
        }
    };

    const handleFileClick = async (file: string, taskDiff?: string) => {
        setSelectedFile(file);
        if (taskDiff) {
            setDiff(taskDiff);
        } else {
            await fetchDiff(file);
        }
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'added':
            case 'untracked':
                return <FilePlusIcon className="w-4 h-4 text-green-500 dark:text-green-400" />;
            case 'deleted':
                return <FileMinusIcon className="w-4 h-4 text-red-500 dark:text-red-400" />;
            default:
                return <FileIcon className="w-4 h-4 text-yellow-500 dark:text-yellow-400" />;
        }
    };

    const displayItems = viewMode === 'task' && hasTaskChanges
        ? taskChanges.map(change => ({
            file: change.file_path,
            type: change.change_type,
            diff: change.diff,
        }))
        : status.map(s => ({
            file: s.file,
            type: s.type,
            diff: undefined,
        }));

    return (
        <div className="h-full flex flex-col bg-white dark:bg-gray-900">
            {/* Header */}
            <div className="h-10 flex items-center justify-between px-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Changes</span>
                <div className="flex items-center gap-1">
                    {hasTaskChanges && (
                        <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                            <button
                                onClick={() => setViewMode('task')}
                                className={`px-2 py-1 text-xs font-medium transition-colors ${viewMode === 'task' ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                            >
                                Task
                            </button>
                            <button
                                onClick={() => setViewMode('worktree')}
                                className={`px-2 py-1 text-xs font-medium transition-colors ${viewMode === 'worktree' ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                            >
                                All
                            </button>
                        </div>
                    )}
                    <button
                        onClick={refreshStatus}
                        disabled={isLoading}
                        className="p-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                    >
                        <RefreshIcon className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Task info */}
            {todo && viewMode === 'task' && (
                <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700 text-xs">
                    <div className="font-medium text-gray-900 dark:text-gray-100 truncate">{todo.title}</div>
                    <div className="text-gray-500 dark:text-gray-400 mt-0.5">
                        {hasTaskChanges ? `${taskChanges.length} file${taskChanges.length > 1 ? 's' : ''} changed` : 'No changes recorded'}
                    </div>
                </div>
            )}

            {/* File list */}
            <div className="flex-1 overflow-y-auto">
                {displayItems.length === 0 ? (
                    <div className="p-4 text-center">
                        <GitBranchIcon className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            {viewMode === 'task' ? 'No changes for this task' : 'No changes in worktree'}
                        </p>
                    </div>
                ) : (
                    <div className="p-2 space-y-0.5">
                        {displayItems.map((item) => (
                            <button
                                key={item.file}
                                onClick={() => handleFileClick(item.file, item.diff || undefined)}
                                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs font-mono transition-colors ${
                                    selectedFile === item.file
                                        ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                                }`}
                            >
                                {getIcon(item.type)}
                                <span className="truncate flex-1">{item.file}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                    item.type === 'added' || item.type === 'untracked'
                                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                        : item.type === 'deleted'
                                        ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                                        : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                                }`}>
                                    {item.type === 'untracked' ? 'new' : item.type}
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Diff viewer */}
            {diff && selectedFile && (
                <div className="border-t border-gray-200 dark:border-gray-700 flex-1 min-h-0 max-h-[60%] overflow-auto">
                    <DiffViewer diff={diff} fileName={selectedFile} />
                </div>
            )}
        </div>
    );
}
