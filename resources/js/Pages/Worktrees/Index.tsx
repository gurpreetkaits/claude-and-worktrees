import { Head, Link, router } from '@inertiajs/react';
import { PageProps, Worktree } from '@/types';
import { useState } from 'react';
import { FolderIcon, GitBranchIcon, PlusIcon, CheckIcon, TrashIcon, HomeIcon, ChevronRightIcon } from '@/Components/ui/Icons';
import { DirectoryBrowser } from '@/Components/DirectoryBrowser';

interface WorktreesIndexProps extends PageProps {
    worktrees: Worktree[];
}

export default function WorktreesIndex({ worktrees }: WorktreesIndexProps) {
    const [showBrowser, setShowBrowser] = useState(false);

    const handleSelect = (path: string, name: string) => {
        router.post(route('worktrees.store'), { path, name });
        setShowBrowser(false);
    };

    const handleDelete = (e: React.MouseEvent, worktree: Worktree) => {
        e.preventDefault();
        e.stopPropagation();
        if (!confirm(`Remove "${worktree.name}" from list?`)) return;
        router.delete(route('worktrees.destroy', worktree.id));
    };

    return (
        <>
            <Head title="Worktrees" />

            <div className="min-h-screen bg-bg-secondary">
                <div className="max-w-4xl mx-auto px-6 py-12">
                    {/* Breadcrumb */}
                    <div className="flex items-center gap-2 mb-6 text-sm text-fg-muted">
                        <Link href={route('dashboard')} className="flex items-center gap-1 hover:text-fg transition-colors">
                            <HomeIcon className="w-4 h-4" />
                            Dashboard
                        </Link>
                        <ChevronRightIcon className="w-3 h-3" />
                        <span className="text-fg">Worktrees</span>
                    </div>

                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-3">
                            <GitBranchIcon className="w-8 h-8 text-fg" />
                            <h1 className="text-2xl font-semibold text-fg">Worktrees</h1>
                        </div>
                        <button
                            onClick={() => setShowBrowser(true)}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-fg text-accent-fg hover:opacity-90 transition-colors"
                        >
                            <PlusIcon className="w-4 h-4" />
                            Add
                        </button>
                    </div>

                    {showBrowser && (
                        <div className="mb-6">
                            <DirectoryBrowser
                                onSelect={handleSelect}
                                onCancel={() => setShowBrowser(false)}
                            />
                        </div>
                    )}

                    {worktrees.length === 0 && !showBrowser ? (
                        <div className="text-center py-16 bg-bg rounded-lg border border-border">
                            <FolderIcon className="w-12 h-12 mx-auto text-fg-muted mb-4" />
                            <p className="text-fg-muted mb-4">No repositories added yet</p>
                            <button
                                onClick={() => setShowBrowser(true)}
                                className="px-4 py-2 text-sm font-medium rounded-md bg-fg text-accent-fg hover:opacity-90 transition-colors"
                            >
                                Browse Directories
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {worktrees.map((worktree) => (
                                <Link
                                    key={worktree.id}
                                    href={route('worktrees.show', worktree.id)}
                                    className="flex items-center gap-4 p-4 bg-bg rounded-lg border border-border hover:border-fg transition-colors group"
                                >
                                    <FolderIcon className="w-5 h-5 text-fg-muted group-hover:text-fg transition-colors" />
                                    <div className="flex-1 min-w-0">
                                        <div className="font-medium text-fg">{worktree.name}</div>
                                        <div className="text-sm text-fg-muted font-mono truncate">
                                            {worktree.path}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-1 text-sm text-fg-muted">
                                            <GitBranchIcon className="w-4 h-4" />
                                            {worktree.branch || 'main'}
                                        </div>
                                        <div className="flex items-center gap-1 text-sm text-fg-muted">
                                            <CheckIcon className="w-4 h-4" />
                                            {worktree.todos_count || 0}
                                        </div>
                                        <button
                                            onClick={(e) => handleDelete(e, worktree)}
                                            className="p-1.5 text-fg-muted hover:text-error hover:bg-error/10 rounded opacity-0 group-hover:opacity-100 transition-all"
                                        >
                                            <TrashIcon className="w-4 h-4" />
                                        </button>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
