import { useState } from 'react';
import { GitStatus, Worktree } from '@/types';
import { DiffViewer } from './ui/DiffViewer';
import { FileIcon, FilePlusIcon, FileMinusIcon, RefreshIcon } from './ui/Icons';
import axios from 'axios';

interface ChangesPanelProps {
    worktree: Worktree;
    initialStatus: GitStatus[];
    initialDiff?: string;
}

export function ChangesPanel({ worktree, initialStatus, initialDiff }: ChangesPanelProps) {
    const [status, setStatus] = useState<GitStatus[]>(initialStatus);
    const [diff, setDiff] = useState(initialDiff || '');
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

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

    const handleFileClick = async (file: string) => {
        setSelectedFile(file);
        await fetchDiff(file);
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

    return (
        <div className="h-full flex flex-col bg-bg-primary">
            <div className="h-12 flex items-center justify-between px-4 border-b border-border">
                <span className="text-sm font-medium text-text-high">Changes</span>
                <button
                    onClick={refreshStatus}
                    disabled={isLoading}
                    className="p-1 hover:bg-bg-panel rounded transition-colors"
                >
                    <RefreshIcon className={`w-4 h-4 text-text-low ${isLoading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-hide">
                {status.length === 0 ? (
                    <div className="p-4 text-center text-sm text-text-low">
                        No changes
                    </div>
                ) : (
                    <div className="p-2 space-y-0.5">
                        {status.map((file) => (
                            <button
                                key={file.file}
                                onClick={() => handleFileClick(file.file)}
                                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs font-mono transition-colors ${
                                    selectedFile === file.file
                                        ? 'bg-brand/10 text-brand'
                                        : 'text-text-high hover:bg-bg-panel'
                                }`}
                            >
                                {getIcon(file.type)}
                                <span className="truncate flex-1">{file.file}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                    file.type === 'added' || file.type === 'untracked'
                                        ? 'bg-success/10 text-success'
                                        : file.type === 'deleted'
                                        ? 'bg-error/10 text-error'
                                        : 'bg-warning/10 text-warning'
                                }`}>
                                    {file.type === 'untracked' ? 'new' : file.type}
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {diff && selectedFile && (
                <div className="border-t border-border flex-1 min-h-0 max-h-[60%] overflow-auto scrollbar-hide">
                    <DiffViewer diff={diff} fileName={selectedFile} />
                </div>
            )}
        </div>
    );
}
