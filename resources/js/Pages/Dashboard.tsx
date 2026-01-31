import { Head, router } from '@inertiajs/react';
import { useState, useEffect, useMemo, Fragment, useCallback } from 'react';
import { PageProps, Worktree, Todo, GitStatus, ClaudeModelsConfig, UserSettings } from '@/types';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react';
// CommandPalette removed - using inline search instead
import { NewTaskDialog } from '@/Components/NewTaskDialog';
import { SettingsDialog } from '@/Components/SettingsDialog';
import { TodoChat } from '@/Components/TodoChat';
import { ChangesPanel } from '@/Components/ChangesPanel';
import { KeyboardShortcutsHelp } from '@/Components/KeyboardShortcutsHelp';
import { useTaskSwitcher } from '@/hooks/useTaskSwitcher';
import { useKeyboardShortcuts, ShortcutAction } from '@/hooks/useKeyboardShortcuts';
import { useRunningSessions } from '@/hooks/useConcurrentSessions';
import {
    PlusIcon,
    SearchIcon,
    GitBranchIcon,
    FolderIcon,
    SparklesIcon,
    MoreVerticalIcon,
    EditIcon,
    SettingsIcon,
    XIcon,
    GitDiffIcon,
    BrainIcon,
    ArchiveIcon,
    CheckCircleIcon,
    CircleIcon,
} from '@/Components/ui/Icons';
import { RunningDots } from '@/Components/ui/RunningDots';

interface DashboardProps extends PageProps {
    worktrees: Worktree[];
    todos: Todo[];
    activeTodo?: Todo | null;
    activeWorktree?: Worktree | null;
    status?: GitStatus[];
    diff?: string;
    models?: ClaudeModelsConfig;
    settings?: UserSettings;
}

export default function Dashboard({
    worktrees,
    todos,
    activeTodo,
    activeWorktree,
    status = [],
    diff = '',
    models,
    settings,
}: DashboardProps) {
    const [showNewTaskDialog, setShowNewTaskDialog] = useState(false);
    const [showSettingsDialog, setShowSettingsDialog] = useState(false);
    const [showChangesPanel, setShowChangesPanel] = useState(true);
    const [openMenuId, setOpenMenuId] = useState<number | null>(null);
    const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    // Filter out archived tasks for display
    const activeTodos = useMemo(() => todos.filter(t => !t.is_archived), [todos]);
    const archivedTodos = useMemo(() => todos.filter(t => t.is_archived), [todos]);
    const [showArchived, setShowArchived] = useState(false);

    // Filter tasks based on search query
    const displayedTodos = useMemo(() => {
        const baseTodos = showArchived ? todos : activeTodos;
        if (!searchQuery.trim()) return baseTodos;
        const query = searchQuery.toLowerCase();
        return baseTodos.filter(todo =>
            todo.title.toLowerCase().includes(query) ||
            todo.context?.toLowerCase().includes(query) ||
            worktrees.find(w => w.id === todo.worktree_id)?.name.toLowerCase().includes(query)
        );
    }, [todos, activeTodos, showArchived, searchQuery, worktrees]);

    // Fast task switching with caching
    const {
        activeTodo: selectedTodo,
        messages: cachedMessages,
        isLoading: isLoadingMessages,
        switchToTask,
        switchToNext,
        switchToPrevious,
        switchToIndex,
        refreshMessages,
        addMessage,
    } = useTaskSwitcher({
        todos: displayedTodos,
        initialActiveTodo: activeTodo,
    });

    // Use selectedTodo from hook, fall back to prop
    const currentTodo = selectedTodo || activeTodo;
    const currentWorktree = currentTodo ? worktrees.find(w => w.id === currentTodo.worktree_id) : activeWorktree;

    // Auto-select first task if none selected
    useEffect(() => {
        if (!currentTodo && displayedTodos.length > 0) {
            switchToTask(displayedTodos[0].id);
        }
    }, [currentTodo, displayedTodos, switchToTask]);

    // Create worktree lookup by id
    const worktreeById = useMemo(() => {
        const lookup: Record<number, Worktree> = {};
        worktrees.forEach((wt) => {
            lookup[wt.id] = wt;
        });
        return lookup;
    }, [worktrees]);

    const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);

    // Get running sessions to track running tasks
    const runningSessions = useRunningSessions();

    // Handle keyboard shortcut actions
    const handleShortcutAction = useCallback((action: ShortcutAction) => {
        switch (action) {
            case 'NEW_TASK':
                setShowNewTaskDialog(true);
                break;
            case 'SEARCH':
                // Focus the search input
                const searchInput = document.querySelector('input[placeholder="Search tasks..."]') as HTMLInputElement;
                searchInput?.focus();
                break;
            case 'SETTINGS':
                setShowSettingsDialog(true);
                break;
            case 'NEXT_TASK':
                switchToNext();
                break;
            case 'PREV_TASK':
                switchToPrevious();
                break;
            case 'TOGGLE_CHANGES':
                setShowChangesPanel(prev => !prev);
                break;
            case 'CANCEL_STREAM':
                setOpenMenuId(null);
                setSearchQuery('');
                setShowNewTaskDialog(false);
                setShowSettingsDialog(false);
                setShowKeyboardHelp(false);
                break;
            case 'HELP':
                setShowKeyboardHelp(true);
                break;
            case 'FOCUS_INPUT':
                // Focus is handled by the chat component
                break;
        }
    }, [switchToNext, switchToPrevious]);

    // Use the keyboard shortcuts hook
    const { sequenceBuffer } = useKeyboardShortcuts({
        onAction: handleShortcutAction,
        enabled: true,
    });

    // Also handle number keys for task switching (1-9)
    useEffect(() => {
        const handleNumberKeys = (e: KeyboardEvent) => {
            // Ignore if typing in an input
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }
            // Number keys 1-9 to switch tasks
            if (e.key >= '1' && e.key <= '9' && !e.metaKey && !e.ctrlKey && !e.altKey) {
                const index = parseInt(e.key) - 1;
                switchToIndex(index);
            }
        };

        window.addEventListener('keydown', handleNumberKeys);
        return () => window.removeEventListener('keydown', handleNumberKeys);
    }, [switchToIndex]);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = () => setOpenMenuId(null);
        if (openMenuId !== null) {
            document.addEventListener('click', handleClickOutside);
            return () => document.removeEventListener('click', handleClickOutside);
        }
    }, [openMenuId]);

    const handleNewTask = () => {
        setShowNewTaskDialog(true);
    };

    const handleArchiveTask = (todoId: number) => {
        router.post(route('todos.archive', todoId), {}, {
            preserveScroll: true,
        });
        setOpenMenuId(null);
    };

    // VS Code style Title Bar
    const TitleBar = () => (
        <div className="h-10 bg-base-200 border-b border-base-300 flex items-center px-3 select-none shrink-0">
            {/* Left - App icon and menu */}
            <div className="flex items-center gap-2 min-w-[140px]">
                <BrainIcon className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-base-content hidden sm:inline">Claude Worktree</span>
            </div>

            {/* Center - Search input */}
            <div className="flex-1 flex justify-center px-4">
                <div className="join w-full max-w-md">
                    <div className="join-item flex items-center px-3 bg-base-100 border border-base-300 border-r-0 rounded-l-lg">
                        <SearchIcon className="w-4 h-4 text-base-content/40" />
                    </div>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search tasks..."
                        className="input input-sm input-bordered join-item flex-1 focus:outline-none focus:border-primary bg-base-100"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="join-item flex items-center px-2 bg-base-100 border border-base-300 border-l-0 rounded-r-lg hover:bg-base-200"
                        >
                            <XIcon className="w-3.5 h-3.5 text-base-content/40" />
                        </button>
                    )}
                </div>
            </div>

            {/* Right - placeholder for balance */}
            <div className="min-w-[140px]" />
        </div>
    );

    // VS Code style Activity Bar (left icon strip)
    const ActivityBar = () => (
        <div className="w-12 bg-base-200 border-r border-base-300 flex flex-col items-center py-2 shrink-0">
            {/* New Task */}
            <div className="tooltip tooltip-right" data-tip="New Task (N)">
                <button
                    onClick={handleNewTask}
                    className="w-10 h-10 flex items-center justify-center text-base-content/60 hover:text-primary transition-colors rounded-lg hover:bg-base-300"
                >
                    <PlusIcon className="w-5 h-5" />
                </button>
            </div>

            {/* Tasks - Active indicator */}
            <div className="tooltip tooltip-right" data-tip="Tasks">
                <button className="w-10 h-10 flex items-center justify-center text-primary transition-colors rounded-lg relative">
                    <FolderIcon className="w-5 h-5" />
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-r" />
                </button>
            </div>

            {/* Git Changes */}
            {currentTodo && currentWorktree && (
                <div className="tooltip tooltip-right" data-tip={showChangesPanel ? 'Hide Changes' : 'Show Changes'}>
                    <button
                        onClick={() => setShowChangesPanel(!showChangesPanel)}
                        className={`w-10 h-10 flex items-center justify-center transition-colors rounded-lg hover:bg-base-300 ${
                            showChangesPanel ? 'text-primary' : 'text-base-content/60 hover:text-base-content'
                        }`}
                    >
                        <GitDiffIcon className="w-5 h-5" />
                    </button>
                </div>
            )}

            <div className="flex-1" />

            {/* Settings at bottom */}
            <div className="tooltip tooltip-right" data-tip="Settings">
                <button
                    onClick={() => setShowSettingsDialog(true)}
                    className="w-10 h-10 flex items-center justify-center text-base-content/60 hover:text-base-content transition-colors rounded-lg hover:bg-base-300"
                >
                    <SettingsIcon className="w-5 h-5" />
                </button>
            </div>
        </div>
    );

    // VS Code style Status Bar
    const StatusBar = () => (
        <div className="h-6 bg-primary flex items-center px-3 text-primary-content text-xs shrink-0">
            <div className="flex items-center gap-3">
                {currentTodo && currentWorktree && (
                    <>
                        <span className="flex items-center gap-1">
                            <GitBranchIcon className="w-3.5 h-3.5" />
                            {currentWorktree.branch || 'main'}
                        </span>
                        <span className="flex items-center gap-1">
                            <FolderIcon className="w-3.5 h-3.5" />
                            {currentWorktree.name}
                        </span>
                    </>
                )}
            </div>
            <div className="flex-1" />
            <div className="flex items-center gap-3">
                <span>{displayedTodos.length} tasks</span>
                {runningSessions.length > 0 && (
                    <span className="flex items-center gap-1">
                        <span className="loading loading-spinner loading-xs" />
                        {runningSessions.length} running
                    </span>
                )}
            </div>
        </div>
    );

    // VS Code style Sidebar
    const Sidebar = () => (
        <div className="h-full flex flex-col bg-base-200">
            {/* Section Header */}
            <div className="h-9 flex items-center justify-between px-4 text-[11px] font-semibold uppercase tracking-wider text-base-content/60 shrink-0">
                <span>Tasks</span>
                <span className="text-base-content/40">{displayedTodos.length}</span>
            </div>

            {/* Tasks list */}
            <div className="flex-1 overflow-y-auto">
                {displayedTodos.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                        <FolderIcon className="w-10 h-10 text-base-content/20 mb-3" />
                        <p className="text-sm text-base-content/50">No tasks yet</p>
                        <p className="text-xs text-base-content/40 mt-1">Press N to create a task</p>
                    </div>
                ) : (
                    <div className="space-y-px">
                        {displayedTodos.map((todo, index) => {
                            const worktree = worktreeById[todo.worktree_id];
                            const isActive = currentTodo?.id === todo.id;
                            const isRunning = runningSessions.includes(todo.id);
                            return (
                                <div
                                    key={todo.id}
                                    onClick={() => switchToTask(todo.id)}
                                    className={`group flex items-start gap-2 px-4 py-2.5 cursor-pointer transition-all ${
                                        isRunning
                                            ? 'bg-primary/5 border-l-2 border-primary'
                                            : isActive
                                            ? 'bg-base-100 border-l-2 border-primary'
                                            : 'hover:bg-base-100/50 border-l-2 border-transparent'
                                    } ${todo.is_archived ? 'opacity-50' : ''}`}
                                >
                                    {/* Status indicator */}
                                    <div className="w-5 h-5 flex items-center justify-center shrink-0">
                                        {isRunning ? (
                                            <span className="loading loading-spinner loading-sm text-primary" />
                                        ) : todo.status === 'completed' ? (
                                            <CheckCircleIcon className="w-4 h-4 text-success" />
                                        ) : (
                                            <CircleIcon className="w-4 h-4 text-base-content/30" />
                                        )}
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className={`text-sm truncate ${isActive || isRunning ? 'text-base-content font-medium' : 'text-base-content/80'}`}>
                                                {todo.title}
                                            </span>
                                            {isRunning && (
                                                <span className="badge badge-primary badge-xs gap-1">
                                                    Running
                                                </span>
                                            )}
                                            {!isRunning && index < 9 && (
                                                <kbd className="text-[9px] px-1 py-0.5 bg-base-300 rounded text-base-content/40 shrink-0">
                                                    {index + 1}
                                                </kbd>
                                            )}
                                        </div>
                                        {worktree && (
                                            <div className="flex items-center gap-2 mt-1 text-[11px] text-base-content/50">
                                                <span className="flex items-center gap-1">
                                                    <FolderIcon className="w-3 h-3" />
                                                    {worktree.name}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <GitBranchIcon className="w-3 h-3" />
                                                    {worktree.branch || 'main'}
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Actions on hover */}
                                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 shrink-0">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setEditingTodo(todo);
                                            }}
                                            className="w-6 h-6 flex items-center justify-center text-base-content/50 hover:text-base-content rounded hover:bg-base-300"
                                        >
                                            <EditIcon className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleArchiveTask(todo.id);
                                            }}
                                            className="w-6 h-6 flex items-center justify-center text-base-content/50 hover:text-base-content rounded hover:bg-base-300"
                                        >
                                            <ArchiveIcon className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Archived toggle */}
            {archivedTodos.length > 0 && (
                <div className="border-t border-base-300 shrink-0">
                    <button
                        onClick={() => setShowArchived(!showArchived)}
                        className="w-full flex items-center gap-2 px-4 py-2 text-xs text-base-content/50 hover:text-base-content hover:bg-base-100/50 transition-colors"
                    >
                        <ArchiveIcon className="w-4 h-4" />
                        {showArchived ? 'Hide' : 'Show'} archived ({archivedTodos.length})
                    </button>
                </div>
            )}
        </div>
    );

    // Center panel - either welcome or chat
    const CenterPanel = () => {
        if (currentTodo) {
            // Merge worktree into todo for TodoChat (without messages - passed separately)
            const todoWithWorktree: Todo = {
                ...currentTodo,
                worktree: currentWorktree || undefined,
            };
            return (
                <TodoChat
                    todo={todoWithWorktree}
                    messages={cachedMessages}
                    onNewMessage={addMessage}
                />
            );
        }

        // VS Code style welcome screen
        return (
            <div className="h-full flex flex-col items-center justify-center bg-base-100 p-8">
                <div className="max-w-md text-center">
                    <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
                        <SparklesIcon className="w-8 h-8 text-primary" />
                    </div>
                    <h1 className="text-2xl font-semibold text-base-content mb-2">Claude Worktree</h1>
                    <p className="text-base-content/60 mb-8">
                        AI-powered development workflow
                    </p>

                    {/* Quick actions */}
                    <div className="space-y-2 text-left max-w-xs mx-auto">
                        <button
                            onClick={handleNewTask}
                            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-base-200 hover:bg-base-300 transition-colors group"
                        >
                            <PlusIcon className="w-5 h-5 text-primary" />
                            <span className="flex-1 text-sm">New Task</span>
                            <kbd className="text-xs px-1.5 py-0.5 bg-base-300 rounded text-base-content/50 group-hover:bg-base-100">N</kbd>
                        </button>
                        <button
                            onClick={() => setShowSettingsDialog(true)}
                            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-base-200 hover:bg-base-300 transition-colors group"
                        >
                            <SettingsIcon className="w-5 h-5 text-base-content/60" />
                            <span className="flex-1 text-sm">Settings</span>
                            <kbd className="text-xs px-1.5 py-0.5 bg-base-300 rounded text-base-content/50 group-hover:bg-base-100">,</kbd>
                        </button>
                    </div>

                    {/* Keyboard shortcuts hint */}
                    <p className="text-xs text-base-content/40 mt-8">
                        Press <kbd className="px-1 py-0.5 bg-base-200 rounded">?</kbd> for keyboard shortcuts
                    </p>
                </div>
            </div>
        );
    };

    return (
        <>
            <Head title="Dashboard" />

            {/* VS Code style layout */}
            <div className="h-screen w-full flex flex-col bg-base-100 overflow-hidden">
                {/* Title Bar */}
                <TitleBar />

                {/* Main area with activity bar, sidebar, and content */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Activity Bar */}
                    <ActivityBar />

                    {/* Main content with resizable panels */}
                    <PanelGroup direction="horizontal" className="flex-1">
                        {/* Sidebar */}
                        <Panel defaultSize={20} minSize={15} maxSize={30}>
                            <Sidebar />
                        </Panel>

                        <PanelResizeHandle className="w-px bg-base-300 hover:bg-primary hover:w-0.5 transition-all cursor-col-resize" />

                        {/* Editor/Chat area */}
                        <Panel minSize={40}>
                            <div className="h-full bg-base-100">
                                <CenterPanel />
                            </div>
                        </Panel>

                        {/* Changes panel */}
                        {currentTodo && currentWorktree && showChangesPanel && (
                            <>
                                <PanelResizeHandle className="w-px bg-base-300 hover:bg-primary hover:w-0.5 transition-all cursor-col-resize" />
                                <Panel defaultSize={22} minSize={15} maxSize={35}>
                                    <ChangesPanel
                                        worktree={currentWorktree}
                                        initialStatus={status}
                                        initialDiff={diff}
                                    />
                                </Panel>
                            </>
                        )}
                    </PanelGroup>
                </div>

                {/* Status Bar */}
                <StatusBar />
            </div>

            {/* New Task Dialog */}
            <NewTaskDialog
                show={showNewTaskDialog}
                worktrees={worktrees}
                models={models}
                defaultProjectsPath={settings?.default_projects_directory || undefined}
                defaultModel={settings?.default_model}
                defaultContext={settings?.default_context || undefined}
                onClose={() => setShowNewTaskDialog(false)}
                onTaskCreated={(taskId) => switchToTask(taskId)}
            />

            {/* Settings Dialog */}
            <SettingsDialog
                show={showSettingsDialog}
                onClose={() => setShowSettingsDialog(false)}
            />

            {/* Keyboard Shortcuts Help */}
            <KeyboardShortcutsHelp
                show={showKeyboardHelp}
                onClose={() => setShowKeyboardHelp(false)}
            />

            {/* Sequence indicator - shows current key sequence */}
            {sequenceBuffer.length > 0 && (
                <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
                    <div className="alert shadow-lg bg-base-100 border border-base-300">
                        <span className="text-sm">
                            {sequenceBuffer.map((key, i) => (
                                <span key={i}>
                                    {i > 0 && <span className="mx-1 opacity-50">→</span>}
                                    <kbd className="kbd kbd-sm">{key}</kbd>
                                </span>
                            ))}
                            <span className="ml-2 animate-pulse opacity-50">...</span>
                        </span>
                    </div>
                </div>
            )}

            {/* Edit Task Dialog */}
            <EditTaskDialog
                todo={editingTodo}
                onClose={() => setEditingTodo(null)}
            />
        </>
    );
}

// Model colors for the edit dialog
const editModelColors: Record<string, { bg: string; border: string; text: string }> = {
    opus: { bg: 'bg-purple-500/10', border: 'border-purple-500', text: 'text-purple-500' },
    sonnet: { bg: 'bg-brand/10', border: 'border-brand', text: 'text-brand' },
    haiku: { bg: 'bg-emerald-500/10', border: 'border-emerald-500', text: 'text-emerald-500' },
};

const editModelInfo: Record<string, { name: string; description: string }> = {
    sonnet: { name: 'Sonnet', description: 'Fast and efficient' },
    opus: { name: 'Opus', description: 'Most capable' },
    haiku: { name: 'Haiku', description: 'Fastest' },
};

// Edit Task Dialog Component
function EditTaskDialog({
    todo,
    onClose,
}: {
    todo: Todo | null;
    onClose: () => void;
}) {
    const [title, setTitle] = useState('');
    const [context, setContext] = useState('');
    const [model, setModel] = useState<'sonnet' | 'opus' | 'haiku'>('sonnet');
    const [preCommand, setPreCommand] = useState('');
    const [postCommand, setPostCommand] = useState('');
    const [messagePrefix, setMessagePrefix] = useState('');
    const [messageSuffix, setMessageSuffix] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [activeTab, setActiveTab] = useState(0);

    useEffect(() => {
        if (todo) {
            setTitle(todo.title);
            setContext(todo.context || '');
            setModel(todo.model || 'sonnet');
            setPreCommand(todo.pre_command || '');
            setPostCommand(todo.post_command || '');
            setMessagePrefix(todo.message_prefix || '');
            setMessageSuffix(todo.message_suffix || '');
            setActiveTab(0);
        }
    }, [todo]);

    // Cmd/Ctrl+Enter to submit
    useEffect(() => {
        if (!todo) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                if (title.trim() && !isSubmitting) {
                    const form = document.getElementById('edit-task-form') as HTMLFormElement;
                    form?.requestSubmit();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [todo, title, isSubmitting]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!todo) return;

        setIsSubmitting(true);

        router.patch(
            route('todos.update', todo.id),
            {
                title: title.trim(),
                context: context.trim() || null,
                model,
                pre_command: preCommand.trim() || null,
                post_command: postCommand.trim() || null,
                message_prefix: messagePrefix.trim() || null,
                message_suffix: messageSuffix.trim() || null,
            },
            {
                onSuccess: () => onClose(),
                onFinish: () => setIsSubmitting(false),
            }
        );
    };

    const show = todo !== null;
    const tabs = [
        { name: 'Task', key: 0 },
        { name: 'Hooks', key: 1 },
    ];

    return (
        <Transition show={show} as={Fragment}>
            <Dialog as="div" className="relative z-50" onClose={onClose}>
                <TransitionChild
                    as={Fragment}
                    enter="ease-out duration-400"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-300"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-md" />
                </TransitionChild>

                <div className="fixed inset-0 overflow-y-auto">
                    <div className="flex min-h-full items-center justify-center p-4 sm:p-6">
                        <TransitionChild
                            as={Fragment}
                            enter="ease-out duration-400"
                            enterFrom="opacity-0 scale-95 translate-y-4"
                            enterTo="opacity-100 scale-100 translate-y-0"
                            leave="ease-in duration-300"
                            leaveFrom="opacity-100 scale-100 translate-y-0"
                            leaveTo="opacity-0 scale-95 translate-y-4"
                        >
                            <DialogPanel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-bg-primary border border-border shadow-2xl transition-all">
                                {/* Header */}
                                <div className="relative px-8 pt-8 pb-6">
                                    <div className="absolute top-4 right-4">
                                        <button
                                            type="button"
                                            onClick={onClose}
                                            className="p-2 text-text-low hover:text-text-high hover:bg-bg-panel rounded-xl transition-all duration-200"
                                        >
                                            <XIcon className="w-5 h-5" />
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-brand/20 to-brand/5 border border-brand/20">
                                            <EditIcon className="w-7 h-7 text-brand" />
                                        </div>
                                        <div>
                                            <h2 className="text-2xl font-bold text-text-high">Edit Task</h2>
                                            <p className="text-sm text-text-low mt-0.5">Modify task settings and hooks</p>
                                        </div>
                                    </div>
                                </div>

                                <form id="edit-task-form" onSubmit={handleSubmit} className="px-8 pb-8">
                                    {/* Tabs */}
                                    <div className="flex gap-1 p-1 bg-bg-secondary rounded-xl mb-6">
                                        {tabs.map((tab) => (
                                            <button
                                                key={tab.key}
                                                type="button"
                                                onClick={() => setActiveTab(tab.key)}
                                                className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                                                    activeTab === tab.key
                                                        ? 'bg-bg-primary text-text-high shadow-sm'
                                                        : 'text-text-low hover:text-text-normal'
                                                }`}
                                            >
                                                {tab.name}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Task Tab */}
                                    {activeTab === 0 && (
                                        <div className="space-y-6">
                                            {/* Title */}
                                            <div className="space-y-2">
                                                <label htmlFor="edit-title" className="text-sm font-semibold text-text-high">
                                                    Title <span className="text-error">*</span>
                                                </label>
                                                <input
                                                    id="edit-title"
                                                    type="text"
                                                    value={title}
                                                    onChange={(e) => setTitle(e.target.value)}
                                                    placeholder="Task title"
                                                    className="w-full px-4 py-3 bg-bg-secondary border-2 border-transparent rounded-xl focus:outline-none focus:border-brand focus:bg-bg-primary transition-all duration-200 text-text-high placeholder:text-text-low/60"
                                                    required
                                                />
                                            </div>

                                            {/* Context */}
                                            <div className="space-y-2">
                                                <label htmlFor="edit-context" className="text-sm font-semibold text-text-high">
                                                    Context
                                                </label>
                                                <textarea
                                                    id="edit-context"
                                                    value={context}
                                                    onChange={(e) => setContext(e.target.value)}
                                                    placeholder="Context for Claude..."
                                                    className="w-full px-4 py-3 bg-bg-secondary border-2 border-transparent rounded-xl focus:outline-none focus:border-brand focus:bg-bg-primary transition-all duration-200 text-text-high placeholder:text-text-low/60 min-h-[120px] resize-y leading-relaxed"
                                                />
                                            </div>

                                            {/* Model */}
                                            <div className="space-y-3">
                                                <label className="text-sm font-semibold text-text-high">
                                                    Model
                                                </label>
                                                <div className="grid grid-cols-3 gap-3">
                                                    {(['sonnet', 'opus', 'haiku'] as const).map((modelKey) => {
                                                        const isSelected = model === modelKey;
                                                        const colors = editModelColors[modelKey];
                                                        return (
                                                            <button
                                                                key={modelKey}
                                                                type="button"
                                                                onClick={() => setModel(modelKey)}
                                                                className={`relative p-4 text-left transition-all duration-200 rounded-xl border-2 ${
                                                                    isSelected
                                                                        ? `${colors.bg} ${colors.border} shadow-lg`
                                                                        : 'bg-bg-secondary border-transparent hover:border-border hover:bg-bg-panel'
                                                                }`}
                                                            >
                                                                {isSelected && (
                                                                    <div className={`absolute top-2 right-2 w-2 h-2 rounded-full ${colors.text.replace('text-', 'bg-')}`} />
                                                                )}
                                                                <div className={`font-semibold text-sm ${isSelected ? 'text-text-high' : 'text-text-normal'}`}>
                                                                    {editModelInfo[modelKey].name}
                                                                </div>
                                                                <div className="text-xs text-text-low mt-1">
                                                                    {editModelInfo[modelKey].description}
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Hooks Tab */}
                                    {activeTab === 1 && (
                                        <div className="space-y-6">
                                            {/* Pre-Command */}
                                            <div className="space-y-2">
                                                <label htmlFor="edit-pre-command" className="text-sm font-semibold text-text-high">
                                                    Pre-Command
                                                </label>
                                                <input
                                                    id="edit-pre-command"
                                                    type="text"
                                                    value={preCommand}
                                                    onChange={(e) => setPreCommand(e.target.value)}
                                                    placeholder="e.g., npm install, git pull"
                                                    className="w-full px-4 py-3 bg-bg-secondary border-2 border-transparent rounded-xl focus:outline-none focus:border-brand focus:bg-bg-primary transition-all duration-200 text-text-high placeholder:text-text-low/60 font-mono text-sm"
                                                />
                                                <p className="text-xs text-text-low">
                                                    Command to run before starting Claude
                                                </p>
                                            </div>

                                            {/* Post-Command */}
                                            <div className="space-y-2">
                                                <label htmlFor="edit-post-command" className="text-sm font-semibold text-text-high">
                                                    Post-Command
                                                </label>
                                                <input
                                                    id="edit-post-command"
                                                    type="text"
                                                    value={postCommand}
                                                    onChange={(e) => setPostCommand(e.target.value)}
                                                    placeholder="e.g., npm test, npm run build"
                                                    className="w-full px-4 py-3 bg-bg-secondary border-2 border-transparent rounded-xl focus:outline-none focus:border-brand focus:bg-bg-primary transition-all duration-200 text-text-high placeholder:text-text-low/60 font-mono text-sm"
                                                />
                                                <p className="text-xs text-text-low">
                                                    Command to run after Claude finishes
                                                </p>
                                            </div>

                                            {/* Message Prefix */}
                                            <div className="space-y-2">
                                                <label htmlFor="edit-message-prefix" className="text-sm font-semibold text-text-high">
                                                    Message Prefix
                                                </label>
                                                <textarea
                                                    id="edit-message-prefix"
                                                    value={messagePrefix}
                                                    onChange={(e) => setMessagePrefix(e.target.value)}
                                                    placeholder="Text to prepend to every message..."
                                                    className="w-full px-4 py-3 bg-bg-secondary border-2 border-transparent rounded-xl focus:outline-none focus:border-brand focus:bg-bg-primary transition-all duration-200 text-text-high placeholder:text-text-low/60 min-h-[80px] resize-y text-sm"
                                                />
                                            </div>

                                            {/* Message Suffix */}
                                            <div className="space-y-2">
                                                <label htmlFor="edit-message-suffix" className="text-sm font-semibold text-text-high">
                                                    Message Suffix
                                                </label>
                                                <textarea
                                                    id="edit-message-suffix"
                                                    value={messageSuffix}
                                                    onChange={(e) => setMessageSuffix(e.target.value)}
                                                    placeholder="Text to append to every message..."
                                                    className="w-full px-4 py-3 bg-bg-secondary border-2 border-transparent rounded-xl focus:outline-none focus:border-brand focus:bg-bg-primary transition-all duration-200 text-text-high placeholder:text-text-low/60 min-h-[80px] resize-y text-sm"
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* Divider */}
                                    <div className="border-t border-border mt-6 pt-6" />

                                    {/* Actions */}
                                    <div className="flex items-center justify-between">
                                        <div className="text-xs text-text-low">
                                            <kbd className="px-1.5 py-0.5 bg-bg-panel rounded text-text-low font-mono">
                                                {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}
                                            </kbd>
                                            <span className="mx-1">+</span>
                                            <kbd className="px-1.5 py-0.5 bg-bg-panel rounded text-text-low font-mono">Enter</kbd>
                                            <span className="ml-2">to save</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <button
                                                type="button"
                                                onClick={onClose}
                                                className="px-6 py-2.5 text-sm font-medium text-text-normal hover:text-text-high hover:bg-bg-panel rounded-xl transition-all duration-200"
                                                disabled={isSubmitting}
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="submit"
                                                className={`flex items-center gap-2 px-8 py-2.5 text-sm font-semibold rounded-xl transition-all duration-200 ${
                                                    !isSubmitting && title.trim()
                                                        ? 'bg-brand hover:bg-brand-hover text-on-brand shadow-lg shadow-brand/25 hover:shadow-xl hover:shadow-brand/30'
                                                        : 'bg-bg-panel text-text-low cursor-not-allowed'
                                                }`}
                                                disabled={isSubmitting || !title.trim()}
                                            >
                                                {isSubmitting ? (
                                                    <>
                                                        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                                        </svg>
                                                        Saving...
                                                    </>
                                                ) : (
                                                    'Save Changes'
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                </form>
                            </DialogPanel>
                        </TransitionChild>
                    </div>
                </div>
            </Dialog>
        </Transition>
    );
}
