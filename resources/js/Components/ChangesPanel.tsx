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

    const taskChanges = todo?.changes || [];
    const hasTaskChanges = taskChanges.length > 0;

    useEffect(() => {
        if (viewMode === 'task' && hasTaskChanges && taskChanges.length > 0) {
            setSelectedFile(taskChanges[0].file_path);
            setDiff(taskChanges[0].diff || '');
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
            const response = await axios.get(route('worktrees.diff', worktree.id), { params: { file } });
            setDiff(response.data.diff || response.data.stagedDiff || '');
        } catch (error) {
            console.error('Failed to fetch diff:', error);
        }
    };

    const handleFileClick = async (file: string, taskDiff?: string) => {
        setSelectedFile(file);
        if (taskDiff) { setDiff(taskDiff); } else { await fetchDiff(file); }
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'added': case 'untracked':
                return <FilePlusIcon className="w-3.5 h-3.5 text-success" />;
            case 'deleted':
                return <FileMinusIcon className="w-3.5 h-3.5 text-error" />;
            default:
                return <FileIcon className="w-3.5 h-3.5 text-warning" />;
        }
    };

    const displayItems = viewMode === 'task' && hasTaskChanges
        ? taskChanges.map(change => ({ file: change.file_path, type: change.change_type, diff: change.diff }))
        : status.map(s => ({ file: s.file, type: s.type, diff: undefined }));

    return (
        <div className="h-full flex flex-col bg-bg">
            {/* Header */}
            <div className="h-10 flex items-center justify-between px-3 border-b border-border shrink-0">
                <span className="text-[11px] font-medium text-fg-muted uppercase tracking-wider">Changes</span>
                <div className="flex items-center gap-1">
                    {hasTaskChanges && (
                        <div className="flex rounded-md overflow-hidden border border-border">
                            <button
                                onClick={() => setViewMode('task')}
                                className={`px-2 py-1 text-[10px] font-medium transition-colors ${viewMode === 'task' ? 'bg-fg text-accent-fg' : 'bg-bg text-fg-muted hover:bg-bg-muted'}`}
                            >
                                Task
                            </button>
                            <button
                                onClick={() => setViewMode('worktree')}
                                className={`px-2 py-1 text-[10px] font-medium transition-colors ${viewMode === 'worktree' ? 'bg-fg text-accent-fg' : 'bg-bg text-fg-muted hover:bg-bg-muted'}`}
                            >
                                All
                            </button>
                        </div>
                    )}
                    <button
                        onClick={refreshStatus}
                        disabled={isLoading}
                        className="p-1 text-fg-muted hover:text-fg hover:bg-bg-muted rounded-md transition-colors"
                    >
                        <RefreshIcon className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Task info */}
            {todo && viewMode === 'task' && (
                <div className="px-3 py-2 bg-bg-secondary border-b border-border text-[11px]">
                    <div className="font-medium text-fg truncate">{todo.title}</div>
                    <div className="text-fg-muted mt-0.5">
                        {hasTaskChanges ? `${taskChanges.length} file${taskChanges.length > 1 ? 's' : ''} changed` : 'No changes recorded'}
                    </div>
                </div>
            )}

            {/* File list */}
            <div className="flex-1 overflow-y-auto">
                {displayItems.length === 0 ? (
                    <div className="p-4 text-center">
                        <GitBranchIcon className="w-6 h-6 text-fg-muted mx-auto mb-2" />
                        <p className="text-xs text-fg-muted">
                            {viewMode === 'task' ? 'No changes for this task' : 'No changes in worktree'}
                        </p>
                    </div>
                ) : (
                    <div className="p-1.5 space-y-0.5">
                        {displayItems.map((item) => (
                            <button
                                key={item.file}
                                onClick={() => handleFileClick(item.file, item.diff || undefined)}
                                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-[11px] font-mono transition-colors ${
                                    selectedFile === item.file
                                        ? 'bg-bg-muted text-fg'
                                        : 'text-fg-secondary hover:bg-bg-muted'
                                }`}
                            >
                                {getIcon(item.type)}
                                <span className="truncate flex-1">{item.file}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                    item.type === 'added' || item.type === 'untracked'
                                        ? 'bg-success/10 text-success'
                                        : item.type === 'deleted'
                                        ? 'bg-error/10 text-error'
                                        : 'bg-warning/10 text-warning'
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
                <div className="border-t border-border flex-1 min-h-0 max-h-[60%] overflow-auto">
                    <DiffViewer diff={diff} fileName={selectedFile} />
                </div>
            )}
        </div>
    );
}
