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
                    <div className="flex items-center gap-2 mb-6 text-sm text-text-low">
                        <Link href={route('dashboard')} className="flex items-center gap-1 hover:text-brand transition-colors">
                            <HomeIcon className="w-4 h-4" />
                            Dashboard
                        </Link>
                        <ChevronRightIcon className="w-3 h-3" />
                        <span className="text-text-high">Worktrees</span>
                    </div>

                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-3">
                            <GitBranchIcon className="w-8 h-8 text-brand" />
                            <h1 className="text-2xl font-semibold text-text-high">Worktrees</h1>
                        </div>
                        <button
                            onClick={() => setShowBrowser(true)}
                            className="btn-primary flex items-center gap-2"
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
                        <div className="text-center py-16 bg-bg-primary rounded-lg border border-border">
                            <FolderIcon className="w-12 h-12 mx-auto text-text-low mb-4" />
                            <p className="text-text-low mb-4">No repositories added yet</p>
                            <button
                                onClick={() => setShowBrowser(true)}
                                className="btn-primary"
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
                                    className="flex items-center gap-4 p-4 bg-bg-primary rounded-lg border border-border hover:border-brand transition-colors group"
                                >
                                    <FolderIcon className="w-5 h-5 text-text-low group-hover:text-brand transition-colors" />
                                    <div className="flex-1 min-w-0">
                                        <div className="font-medium text-text-high">{worktree.name}</div>
                                        <div className="text-sm text-text-low font-mono truncate">
                                            {worktree.path}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-1 text-sm text-text-low">
                                            <GitBranchIcon className="w-4 h-4" />
                                            {worktree.branch || 'main'}
                                        </div>
                                        <div className="flex items-center gap-1 text-sm text-text-low">
                                            <CheckIcon className="w-4 h-4" />
                                            {worktree.todos_count || 0}
                                        </div>
                                        <button
                                            onClick={(e) => handleDelete(e, worktree)}
                                            className="p-1.5 text-text-low hover:text-error hover:bg-error/10 rounded opacity-0 group-hover:opacity-100 transition-all"
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
