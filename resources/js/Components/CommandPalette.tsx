import { useState, useEffect, Fragment, useCallback } from 'react';
import { router } from '@inertiajs/react';
import { Dialog, DialogPanel, Transition, TransitionChild, Combobox, ComboboxInput, ComboboxOptions, ComboboxOption } from '@headlessui/react';
import { Todo, Worktree } from '@/types';
import { SearchIcon, SparklesIcon, FolderIcon, PlusIcon, CircleIcon, LoaderIcon, CheckCircleIcon, XCircleIcon } from './ui/Icons';

interface CommandPaletteProps {
    show: boolean;
    worktrees: Worktree[];
    todos: Todo[];
    onClose: () => void;
    onNewTask: () => void;
}

type CommandItem = {
    id: string;
    type: 'action' | 'todo' | 'worktree';
    title: string;
    subtitle?: string;
    icon?: 'new' | 'folder' | 'todo';
    status?: string;
    href?: string;
};

function StatusIcon({ status }: { status: string }) {
    switch (status) {
        case 'running':
            return <LoaderIcon className="w-4 h-4 text-info animate-spin" />;
        case 'completed':
            return <CheckCircleIcon className="w-4 h-4 text-success" />;
        case 'failed':
            return <XCircleIcon className="w-4 h-4 text-error" />;
        default:
            return <CircleIcon className="w-4 h-4 text-text-low" />;
    }
}

export function CommandPalette({
    show,
    worktrees,
    todos,
    onClose,
    onNewTask,
}: CommandPaletteProps) {
    const [query, setQuery] = useState('');

    useEffect(() => {
        if (show) {
            setQuery('');
        }
    }, [show]);

    const buildItems = useCallback((): CommandItem[] => {
        const items: CommandItem[] = [];

        items.push({
            id: 'new-task',
            type: 'action',
            title: 'New Task',
            subtitle: 'Create a new task with Claude Code',
            icon: 'new',
        });

        todos.forEach((todo) => {
            const worktree = worktrees.find((w) => w.id === todo.worktree_id);
            items.push({
                id: `todo-${todo.id}`,
                type: 'todo',
                title: todo.title,
                subtitle: worktree?.name,
                status: todo.status,
                href: route('todos.show', todo.id),
            });
        });

        worktrees.forEach((worktree) => {
            items.push({
                id: `worktree-${worktree.id}`,
                type: 'worktree',
                title: worktree.name,
                subtitle: worktree.path,
                icon: 'folder',
                href: route('worktrees.show', worktree.id),
            });
        });

        return items;
    }, [worktrees, todos]);

    const filteredItems = useCallback(() => {
        const items = buildItems();
        if (!query) return items;

        const lowerQuery = query.toLowerCase();
        return items.filter(
            (item) =>
                item.title.toLowerCase().includes(lowerQuery) ||
                item.subtitle?.toLowerCase().includes(lowerQuery)
        );
    }, [buildItems, query]);

    const handleSelect = (item: CommandItem | null) => {
        if (!item) return;

        if (item.id === 'new-task') {
            onClose();
            onNewTask();
        } else if (item.href) {
            onClose();
            router.visit(item.href);
        }
    };

    const items = filteredItems();
    const actionItems = items.filter((i) => i.type === 'action');
    const todoItems = items.filter((i) => i.type === 'todo');
    const worktreeItems = items.filter((i) => i.type === 'worktree');

    return (
        <Transition show={show} as={Fragment}>
            <Dialog as="div" className="relative z-50" onClose={onClose}>
                <TransitionChild
                    as={Fragment}
                    enter="ease-out duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-200"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-md" />
                </TransitionChild>

                <div className="fixed inset-0 overflow-y-auto p-4 sm:p-6 md:p-20">
                    <TransitionChild
                        as={Fragment}
                        enter="ease-out duration-300"
                        enterFrom="opacity-0 scale-95 translate-y-4"
                        enterTo="opacity-100 scale-100 translate-y-0"
                        leave="ease-in duration-200"
                        leaveFrom="opacity-100 scale-100 translate-y-0"
                        leaveTo="opacity-0 scale-95 translate-y-4"
                    >
                        <DialogPanel className="mx-auto max-w-2xl transform overflow-hidden rounded-2xl bg-bg-primary border border-border shadow-2xl transition-all">
                            <Combobox onChange={handleSelect}>
                                <div className="relative flex items-center border-b border-border">
                                    <SearchIcon className="absolute left-5 h-5 w-5 text-text-low" />
                                    <ComboboxInput
                                        className="w-full border-0 bg-transparent pl-14 pr-4 py-4 text-lg text-text-high placeholder:text-text-low focus:outline-none focus:ring-0"
                                        placeholder="Search tasks, repositories..."
                                        onChange={(e) => setQuery(e.target.value)}
                                        autoFocus
                                    />
                                    <kbd className="absolute right-4 px-2 py-1 bg-bg-panel rounded text-xs text-text-low font-mono">esc</kbd>
                                </div>

                                <ComboboxOptions static className="max-h-[60vh] overflow-y-auto scrollbar-thin">
                                    {items.length === 0 && query && (
                                        <div className="flex flex-col items-center justify-center py-12 text-center">
                                            <SearchIcon className="w-12 h-12 text-text-low/30 mb-4" />
                                            <p className="text-text-normal">No results found for "{query}"</p>
                                            <p className="text-sm text-text-low mt-1">Try a different search term</p>
                                        </div>
                                    )}

                                    {actionItems.length > 0 && (
                                        <div className="p-3">
                                            <div className="text-xs font-semibold text-text-low uppercase tracking-wider px-3 py-2">
                                                Quick Actions
                                            </div>
                                            {actionItems.map((item) => (
                                                <ComboboxOption
                                                    key={item.id}
                                                    value={item}
                                                    className="flex items-center gap-4 px-4 py-3 cursor-pointer rounded-xl transition-colors data-[focus]:bg-brand/10"
                                                >
                                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand/20 to-brand/5 flex items-center justify-center border border-brand/20">
                                                        <PlusIcon className="w-5 h-5 text-brand" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="font-semibold text-text-high">
                                                            {item.title}
                                                        </div>
                                                        {item.subtitle && (
                                                            <div className="text-sm text-text-low">
                                                                {item.subtitle}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <kbd className="px-2 py-1 bg-bg-panel rounded text-xs text-text-low font-mono">Enter</kbd>
                                                </ComboboxOption>
                                            ))}
                                        </div>
                                    )}

                                    {todoItems.length > 0 && (
                                        <div className="p-3 border-t border-border">
                                            <div className="text-xs font-semibold text-text-low uppercase tracking-wider px-3 py-2">
                                                Tasks
                                            </div>
                                            {todoItems.map((item) => (
                                                <ComboboxOption
                                                    key={item.id}
                                                    value={item}
                                                    className="flex items-center gap-4 px-4 py-3 cursor-pointer rounded-xl transition-colors data-[focus]:bg-bg-panel"
                                                >
                                                    <StatusIcon status={item.status || 'pending'} />
                                                    <div className="flex-1 min-w-0">
                                                        <div className="font-medium text-text-high truncate">
                                                            {item.title}
                                                        </div>
                                                        {item.subtitle && (
                                                            <div className="text-sm text-text-low truncate flex items-center gap-1">
                                                                <FolderIcon className="w-3 h-3" />
                                                                {item.subtitle}
                                                            </div>
                                                        )}
                                                    </div>
                                                </ComboboxOption>
                                            ))}
                                        </div>
                                    )}

                                    {worktreeItems.length > 0 && (
                                        <div className="p-3 border-t border-border">
                                            <div className="text-xs font-semibold text-text-low uppercase tracking-wider px-3 py-2">
                                                Repositories
                                            </div>
                                            {worktreeItems.map((item) => (
                                                <ComboboxOption
                                                    key={item.id}
                                                    value={item}
                                                    className="flex items-center gap-4 px-4 py-3 cursor-pointer rounded-xl transition-colors data-[focus]:bg-bg-panel"
                                                >
                                                    <div className="w-8 h-8 rounded-lg bg-bg-panel flex items-center justify-center">
                                                        <FolderIcon className="w-4 h-4 text-text-low" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="font-medium text-text-high truncate">
                                                            {item.title}
                                                        </div>
                                                        {item.subtitle && (
                                                            <div className="text-sm text-text-low font-mono truncate">
                                                                {item.subtitle}
                                                            </div>
                                                        )}
                                                    </div>
                                                </ComboboxOption>
                                            ))}
                                        </div>
                                    )}
                                </ComboboxOptions>

                                <div className="flex items-center justify-between gap-4 px-5 py-3 border-t border-border bg-bg-secondary text-sm text-text-low">
                                    <div className="flex items-center gap-4">
                                        <span className="flex items-center gap-1.5">
                                            <kbd className="px-1.5 py-0.5 bg-bg-panel rounded text-xs font-mono">↑</kbd>
                                            <kbd className="px-1.5 py-0.5 bg-bg-panel rounded text-xs font-mono">↓</kbd>
                                            navigate
                                        </span>
                                        <span className="flex items-center gap-1.5">
                                            <kbd className="px-1.5 py-0.5 bg-bg-panel rounded text-xs font-mono">Enter</kbd>
                                            select
                                        </span>
                                    </div>
                                    <span className="flex items-center gap-1.5">
                                        <kbd className="px-1.5 py-0.5 bg-bg-panel rounded text-xs font-mono">Esc</kbd>
                                        close
                                    </span>
                                </div>
                            </Combobox>
                        </DialogPanel>
                    </TransitionChild>
                </div>
            </Dialog>
        </Transition>
    );
}
