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
                return <FilePlusIcon className="w-4 h-4 text-success" />;
            case 'deleted':
                return <FileMinusIcon className="w-4 h-4 text-error" />;
            default:
                return <FileIcon className="w-4 h-4 text-warning" />;
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
        <div className="h-full flex flex-col bg-base-100">
            {/* Header */}
            <div className="h-10 flex items-center justify-between px-3 border-b border-base-300 shrink-0">
                <span className="text-xs font-semibold text-base-content/60 uppercase tracking-wider">Changes</span>
                <div className="flex items-center gap-1">
                    {hasTaskChanges && (
                        <div className="join">
                            <button
                                onClick={() => setViewMode('task')}
                                className={`join-item btn btn-xs ${viewMode === 'task' ? 'btn-primary' : 'btn-ghost'}`}
                            >
                                Task
                            </button>
                            <button
                                onClick={() => setViewMode('worktree')}
                                className={`join-item btn btn-xs ${viewMode === 'worktree' ? 'btn-primary' : 'btn-ghost'}`}
                            >
                                All
                            </button>
                        </div>
                    )}
                    <button
                        onClick={refreshStatus}
                        disabled={isLoading}
                        className="btn btn-ghost btn-xs btn-square"
                    >
                        <RefreshIcon className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Task info */}
            {todo && viewMode === 'task' && (
                <div className="px-3 py-2 bg-base-200/50 border-b border-base-300 text-xs">
                    <div className="font-medium text-base-content truncate">{todo.title}</div>
                    <div className="text-base-content/50 mt-0.5">
                        {hasTaskChanges ? `${taskChanges.length} file${taskChanges.length > 1 ? 's' : ''} changed` : 'No changes recorded'}
                    </div>
                </div>
            )}

            {/* File list */}
            <div className="flex-1 overflow-y-auto">
                {displayItems.length === 0 ? (
                    <div className="p-4 text-center">
                        <GitBranchIcon className="w-8 h-8 text-base-content/20 mx-auto mb-2" />
                        <p className="text-sm text-base-content/50">
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
                                        ? 'bg-primary/10 text-primary'
                                        : 'text-base-content hover:bg-base-200'
                                }`}
                            >
                                {getIcon(item.type)}
                                <span className="truncate flex-1">{item.file}</span>
                                <span className={`badge badge-xs ${
                                    item.type === 'added' || item.type === 'untracked'
                                        ? 'badge-success'
                                        : item.type === 'deleted'
                                        ? 'badge-error'
                                        : 'badge-warning'
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
                <div className="border-t border-base-300 flex-1 min-h-0 max-h-[60%] overflow-auto">
                    <DiffViewer diff={diff} fileName={selectedFile} />
                </div>
            )}
        </div>
    );
}
