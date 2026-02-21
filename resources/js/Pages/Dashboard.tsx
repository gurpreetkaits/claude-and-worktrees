import { Head, router } from '@inertiajs/react';
import React, { useState, useEffect, useMemo, Fragment, useCallback, useRef } from 'react';
import { PageProps, Worktree, Todo, GitStatus, ClaudeModelsConfig, UserSettings, TodoStatus } from '@/types';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { NewTaskDialog } from '@/Components/NewTaskDialog';
import { SettingsDialog } from '@/Components/SettingsDialog';
import { ChatConversation } from '@/Components/chat';
import { ChangesPanel } from '@/Components/ChangesPanel';
import { TerminalPanel } from '@/Components/TerminalPanel';
import { KeyboardShortcutsHelp } from '@/Components/KeyboardShortcutsHelp';
import { useTaskSwitcher } from '@/hooks/useTaskSwitcher';
import { useKeyboardShortcuts, ShortcutAction } from '@/hooks/useKeyboardShortcuts';
import { useRunningSessions, requestNotificationPermission } from '@/hooks/useConcurrentSessions';
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
    TerminalIcon,
    CopyIcon,
    GripVerticalIcon,
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

// Status group configuration
const STATUS_GROUPS: { key: string; label: string; statuses: TodoStatus[]; dotClass: string }[] = [
    { key: 'in_progress', label: 'In Progress', statuses: ['running', 'pending'], dotClass: 'bg-fg' },
    { key: 'qa', label: 'QA', statuses: ['qa'], dotClass: 'bg-warning' },
    { key: 'done', label: 'Done', statuses: ['completed'], dotClass: 'bg-success' },
];

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
    const [rightPanel, setRightPanel] = useState<'changes' | 'terminal' | null>(null);
    const [openMenuId, setOpenMenuId] = useState<number | null>(null);
    const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
    const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Filter out archived tasks
    const activeTodos = useMemo(() => todos.filter(t => !t.is_archived), [todos]);
    const archivedTodos = useMemo(() => todos.filter(t => t.is_archived), [todos]);
    const [showArchived, setShowArchived] = useState(false);

    // Ordered todos for drag and drop
    const [orderedTodoIds, setOrderedTodoIds] = useState<number[]>(() => todos.map(t => t.id));

    useEffect(() => {
        const currentIds = new Set(orderedTodoIds);
        const newIds = todos.map(t => t.id);
        const hasNewTodos = newIds.some(id => !currentIds.has(id));
        const hasRemovedTodos = orderedTodoIds.some(id => !newIds.includes(id));

        if (hasNewTodos || hasRemovedTodos) {
            const existingOrdered = orderedTodoIds.filter(id => newIds.includes(id));
            const newTodoIds = newIds.filter(id => !currentIds.has(id));
            setOrderedTodoIds([...newTodoIds, ...existingOrdered]);
        }
    }, [todos]);

    // Filter + order tasks
    const displayedTodos = useMemo(() => {
        const baseTodos = showArchived ? todos : activeTodos;
        const todoMap = new Map(baseTodos.map(t => [t.id, t]));

        let ordered = orderedTodoIds
            .filter(id => todoMap.has(id))
            .map(id => todoMap.get(id)!);

        const orderedSet = new Set(orderedTodoIds);
        const unordered = baseTodos.filter(t => !orderedSet.has(t.id));
        ordered = [...unordered, ...ordered];

        if (!searchQuery.trim()) return ordered;
        const query = searchQuery.toLowerCase();
        return ordered.filter(todo =>
            todo.title.toLowerCase().includes(query) ||
            todo.context?.toLowerCase().includes(query) ||
            worktrees.find(w => w.id === todo.worktree_id)?.name.toLowerCase().includes(query)
        );
    }, [todos, activeTodos, showArchived, searchQuery, worktrees, orderedTodoIds]);

    // Group tasks by status
    const groupedTodos = useMemo(() => {
        const groups: Record<string, Todo[]> = {};
        STATUS_GROUPS.forEach(g => { groups[g.key] = []; });
        groups['other'] = [];

        displayedTodos.forEach(todo => {
            const group = STATUS_GROUPS.find(g => g.statuses.includes(todo.status));
            if (group) {
                groups[group.key].push(todo);
            } else {
                groups['other'].push(todo);
            }
        });

        return groups;
    }, [displayedTodos]);

    // Drag and drop
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            setOrderedTodoIds((items) => {
                const oldIndex = items.indexOf(Number(active.id));
                const newIndex = items.indexOf(Number(over.id));
                const newOrder = arrayMove(items, oldIndex, newIndex);
                fetch(route('todos.reorder'), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-TOKEN': document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content || '',
                    },
                    body: JSON.stringify({ orderedIds: newOrder }),
                });
                return newOrder;
            });
        }
    }, []);

    // Task switching
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

    const currentTodo = selectedTodo || activeTodo;
    const currentWorktree = currentTodo ? worktrees.find(w => w.id === currentTodo.worktree_id) : activeWorktree;

    useEffect(() => {
        if (!currentTodo && displayedTodos.length > 0) {
            switchToTask(displayedTodos[0].id);
        }
    }, [currentTodo, displayedTodos, switchToTask]);

    const worktreeById = useMemo(() => {
        const lookup: Record<number, Worktree> = {};
        worktrees.forEach((wt) => { lookup[wt.id] = wt; });
        return lookup;
    }, [worktrees]);

    const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
    const runningSessions = useRunningSessions();

    // Notification permission
    useEffect(() => {
        const handler = () => {
            requestNotificationPermission();
            window.removeEventListener('click', handler);
            window.removeEventListener('keydown', handler);
        };
        window.addEventListener('click', handler);
        window.addEventListener('keydown', handler);
        return () => {
            window.removeEventListener('click', handler);
            window.removeEventListener('keydown', handler);
        };
    }, []);

    // Keyboard shortcuts
    const handleShortcutAction = useCallback((action: ShortcutAction) => {
        switch (action) {
            case 'NEW_TASK': setShowNewTaskDialog(true); break;
            case 'SEARCH': searchInputRef.current?.focus(); break;
            case 'SETTINGS': setShowSettingsDialog(true); break;
            case 'NEXT_TASK': switchToNext(); break;
            case 'PREV_TASK': switchToPrevious(); break;
            case 'TOGGLE_CHANGES': setRightPanel(prev => prev === 'changes' ? null : 'changes'); break;
            case 'CANCEL_STREAM':
                setOpenMenuId(null);
                setSearchQuery('');
                setShowNewTaskDialog(false);
                setShowSettingsDialog(false);
                setShowKeyboardHelp(false);
                break;
            case 'HELP': setShowKeyboardHelp(true); break;
            case 'FOCUS_INPUT': break;
        }
    }, [switchToNext, switchToPrevious]);

    const { sequenceBuffer } = useKeyboardShortcuts({
        onAction: handleShortcutAction,
        enabled: true,
    });

    // Number keys 1-9
    useEffect(() => {
        const handleNumberKeys = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            if (e.key >= '1' && e.key <= '9' && !e.metaKey && !e.ctrlKey && !e.altKey) {
                switchToIndex(parseInt(e.key) - 1);
            }
        };
        window.addEventListener('keydown', handleNumberKeys);
        return () => window.removeEventListener('keydown', handleNumberKeys);
    }, [switchToIndex]);

    // Close menu on outside click
    useEffect(() => {
        if (openMenuId !== null) {
            const handleClickOutside = () => { setOpenMenuId(null); setMenuPosition(null); };
            document.addEventListener('click', handleClickOutside);
            return () => document.removeEventListener('click', handleClickOutside);
        }
    }, [openMenuId]);

    const handleNewTask = () => setShowNewTaskDialog(true);

    const handleArchiveTask = (todoId: number) => {
        router.post(route('todos.archive', todoId), {}, { preserveScroll: true });
        setOpenMenuId(null);
    };

    const handleDuplicateTask = (todoId: number) => {
        router.post(route('todos.duplicate', todoId), {}, { preserveScroll: true });
        setOpenMenuId(null);
    };

    const handleStatusChange = (todoId: number, newStatus: TodoStatus) => {
        router.patch(route('todos.update', todoId), { status: newStatus }, { preserveScroll: true });
        setOpenMenuId(null);
        setMenuPosition(null);
    };

    // Sortable Task Card
    const SortableTaskCard = ({ todo, index }: { todo: Todo; index: number }) => {
        const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: todo.id });
        const style = {
            transform: CSS.Transform.toString(transform),
            transition,
            opacity: isDragging ? 0.5 : 1,
            zIndex: isDragging ? 1000 : 'auto' as const,
        };

        const worktree = worktreeById[todo.worktree_id];
        const isActive = currentTodo?.id === todo.id;
        const isRunning = runningSessions.includes(todo.id);

        return (
            <div
                ref={setNodeRef}
                style={style}
                className={`group cursor-pointer transition-all duration-150 rounded-md mx-1 ${
                    isDragging
                        ? 'bg-bg shadow-lg ring-1 ring-border'
                        : isActive
                        ? 'bg-bg-muted ring-1 ring-border-strong'
                        : 'hover:bg-bg-muted'
                } ${todo.is_archived ? 'opacity-40' : ''}`}
                onClick={() => switchToTask(todo.id)}
            >
                <div className="flex items-start gap-2 px-2.5 py-2">
                    {/* Drag Handle */}
                    <div
                        {...attributes}
                        {...listeners}
                        className="w-4 h-4 flex items-center justify-center shrink-0 mt-0.5 cursor-grab active:cursor-grabbing text-fg-muted hover:text-fg-secondary opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <GripVerticalIcon className="w-3.5 h-3.5" />
                    </div>

                    {/* Status indicator */}
                    <div className="w-4 h-4 flex items-center justify-center shrink-0 mt-0.5">
                        {isRunning ? (
                            <span className="w-3.5 h-3.5 border-2 border-fg-muted border-t-fg rounded-full animate-spin" />
                        ) : todo.status === 'completed' ? (
                            <CheckCircleIcon className="w-4 h-4 text-success" />
                        ) : todo.status === 'qa' ? (
                            <span className="w-3 h-3 rounded-full bg-warning" />
                        ) : (
                            <CircleIcon className="w-4 h-4 text-fg-muted" />
                        )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                            <span className={`text-[13px] truncate ${isActive ? 'text-fg font-medium' : 'text-fg-secondary'}`}>
                                {todo.title}
                            </span>
                            {isRunning && todo.is_autonomous && (
                                <span className="px-1.5 py-0.5 text-[10px] font-medium bg-warning/20 text-warning rounded">
                                    Auto {todo.autonomous_current_iteration}/{todo.autonomous_max_iterations}
                                </span>
                            )}
                            {isRunning && !todo.is_autonomous && (
                                <span className="px-1.5 py-0.5 text-[10px] font-medium bg-fg text-accent-fg rounded">
                                    Running
                                </span>
                            )}
                            {!isRunning && todo.is_autonomous && todo.autonomous_phase && todo.autonomous_phase !== 'completed' && todo.autonomous_phase !== 'failed' && (
                                <span className="px-1.5 py-0.5 text-[10px] font-medium bg-warning/10 text-warning border border-warning/20 rounded">
                                    Auto
                                </span>
                            )}
                        </div>

                        {worktree && (
                            <div className="flex items-center gap-2 mt-1 text-[11px] text-fg-muted">
                                <span className="flex items-center gap-0.5">
                                    <FolderIcon className="w-3 h-3" />
                                    {worktree.name}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div className={`shrink-0 ${openMenuId === todo.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                if (openMenuId === todo.id) {
                                    setOpenMenuId(null);
                                    setMenuPosition(null);
                                } else {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setMenuPosition({ top: rect.bottom + 4, left: rect.right - 180 });
                                    setOpenMenuId(todo.id);
                                }
                            }}
                            className="p-0.5 rounded hover:bg-bg-accent text-fg-muted hover:text-fg-secondary"
                        >
                            <MoreVerticalIcon className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    // Left Sidebar with grouped tasks
    const TaskPanel = () => (
        <div className="h-full flex flex-col bg-bg-secondary">
            {/* Header */}
            <div className="h-12 flex items-center justify-between px-4 border-b border-border shrink-0">
                <span className="text-sm font-semibold text-fg">Tasks</span>
                <div className="flex items-center gap-1">
                    <button
                        onClick={handleNewTask}
                        className="p-1.5 rounded-md hover:bg-bg-muted text-fg-muted hover:text-fg transition-colors"
                        title="New Task (N)"
                    >
                        <PlusIcon className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setShowSettingsDialog(true)}
                        className="p-1.5 rounded-md hover:bg-bg-muted text-fg-muted hover:text-fg transition-colors"
                        title="Settings"
                    >
                        <SettingsIcon className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Search */}
            <div className="px-3 py-2 border-b border-border">
                <div className="relative">
                    <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-fg-muted" />
                    <input
                        ref={searchInputRef}
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search..."
                        className="w-full pl-8 pr-3 py-1.5 bg-bg-muted border-0 rounded-md text-xs text-fg placeholder-fg-muted focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg"
                        >
                            <XIcon className="w-3 h-3" />
                        </button>
                    )}
                </div>
            </div>

            {/* Task groups */}
            <div className="flex-1 overflow-y-auto scrollbar-thin">
                {displayedTodos.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                        <div className="w-10 h-10 rounded-full bg-bg-muted flex items-center justify-center mb-3">
                            <SparklesIcon className="w-5 h-5 text-fg-muted" />
                        </div>
                        <p className="text-sm text-fg-secondary">No tasks yet</p>
                        <p className="text-xs text-fg-muted mt-1">Press <kbd className="px-1 py-0.5 bg-bg-muted rounded text-[10px]">N</kbd> to create one</p>
                    </div>
                ) : (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <SortableContext items={displayedTodos.map(t => t.id)} strategy={verticalListSortingStrategy}>
                            {STATUS_GROUPS.map(group => {
                                const items = groupedTodos[group.key];
                                if (!items || items.length === 0) return null;

                                return (
                                    <div key={group.key} className="py-1">
                                        {/* Group header */}
                                        <div className="flex items-center gap-2 px-4 py-1.5">
                                            <span className={`w-2 h-2 rounded-full ${group.dotClass}`} />
                                            <span className="text-[11px] font-medium text-fg-muted uppercase tracking-wider">
                                                {group.label}
                                            </span>
                                            <span className="text-[10px] text-fg-muted bg-bg-muted px-1.5 py-0.5 rounded-full">
                                                {items.length}
                                            </span>
                                        </div>

                                        {/* Tasks in group */}
                                        <div className="space-y-0.5 pb-1">
                                            {items.map((todo, index) => (
                                                <SortableTaskCard key={todo.id} todo={todo} index={index} />
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}

                            {/* "Other" group for failed/cancelled */}
                            {groupedTodos['other'] && groupedTodos['other'].length > 0 && (
                                <div className="py-1">
                                    <div className="flex items-center gap-2 px-4 py-1.5">
                                        <span className="w-2 h-2 rounded-full bg-error" />
                                        <span className="text-[11px] font-medium text-fg-muted uppercase tracking-wider">
                                            Other
                                        </span>
                                        <span className="text-[10px] text-fg-muted bg-bg-muted px-1.5 py-0.5 rounded-full">
                                            {groupedTodos['other'].length}
                                        </span>
                                    </div>
                                    <div className="space-y-0.5 pb-1">
                                        {groupedTodos['other'].map((todo, index) => (
                                            <SortableTaskCard key={todo.id} todo={todo} index={index} />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </SortableContext>
                    </DndContext>
                )}
            </div>

            {/* Archived toggle */}
            {archivedTodos.length > 0 && (
                <div className="border-t border-border shrink-0">
                    <button
                        onClick={() => setShowArchived(!showArchived)}
                        className="w-full flex items-center gap-2 px-4 py-2 text-xs text-fg-muted hover:text-fg-secondary hover:bg-bg-muted transition-colors"
                    >
                        <ArchiveIcon className="w-3.5 h-3.5" />
                        {showArchived ? 'Hide' : 'Show'} archived ({archivedTodos.length})
                    </button>
                </div>
            )}
        </div>
    );

    // Chat panel
    const ChatPanel = () => {
        if (currentTodo) {
            const todoWithWorktree: Todo = {
                ...currentTodo,
                worktree: currentWorktree || undefined,
            };
            return (
                <div className="h-full flex flex-col">
                    {/* Task header */}
                    <div className="h-12 flex items-center justify-between px-4 border-b border-border bg-bg shrink-0">
                        <div className="flex items-center gap-3 min-w-0">
                            <h2 className="text-sm font-medium text-fg truncate">{currentTodo.title}</h2>
                            {currentTodo.status && (
                                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                                    currentTodo.status === 'running' ? 'bg-fg text-accent-fg border-fg' :
                                    currentTodo.status === 'completed' ? 'bg-success/10 text-success border-success/20' :
                                    currentTodo.status === 'qa' ? 'bg-warning/10 text-warning border-warning/20' :
                                    'bg-bg-muted text-fg-muted border-border'
                                }`}>
                                    {currentTodo.status === 'running' ? 'Running' :
                                     currentTodo.status === 'completed' ? 'Done' :
                                     currentTodo.status === 'qa' ? 'QA' :
                                     currentTodo.status}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-1">
                            {currentWorktree && (
                                <>
                                    <button
                                        onClick={() => setRightPanel(prev => prev === 'changes' ? null : 'changes')}
                                        className={`p-1.5 rounded-md transition-colors ${
                                            rightPanel === 'changes' ? 'bg-fg text-accent-fg' : 'text-fg-muted hover:bg-bg-muted hover:text-fg'
                                        }`}
                                        title="Changes"
                                    >
                                        <GitDiffIcon className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => setRightPanel(prev => prev === 'terminal' ? null : 'terminal')}
                                        className={`p-1.5 rounded-md transition-colors ${
                                            rightPanel === 'terminal' ? 'bg-fg text-accent-fg' : 'text-fg-muted hover:bg-bg-muted hover:text-fg'
                                        }`}
                                        title="Terminal"
                                    >
                                        <TerminalIcon className="w-4 h-4" />
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Chat */}
                    <div className="flex-1 min-h-0">
                        <ChatConversation
                            todo={todoWithWorktree}
                            messages={cachedMessages}
                            onNewMessage={addMessage}
                        />
                    </div>
                </div>
            );
        }

        // Welcome screen
        return (
            <div className="h-full flex flex-col items-center justify-center bg-bg p-8">
                <div className="max-w-sm text-center">
                    <div className="w-12 h-12 rounded-full bg-bg-muted border border-border flex items-center justify-center mx-auto mb-5">
                        <SparklesIcon className="w-6 h-6 text-fg-muted" />
                    </div>
                    <h1 className="text-lg font-semibold text-fg mb-1">Claude Worktree</h1>
                    <p className="text-sm text-fg-muted mb-8">AI-powered development workflow</p>

                    <div className="space-y-2 text-left">
                        <button
                            onClick={handleNewTask}
                            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-border hover:bg-bg-muted transition-colors group"
                        >
                            <PlusIcon className="w-4 h-4 text-fg-secondary" />
                            <span className="flex-1 text-sm text-fg">New Task</span>
                            <kbd className="text-[10px] px-1.5 py-0.5 bg-bg-muted rounded text-fg-muted border border-border">N</kbd>
                        </button>
                        <button
                            onClick={() => setShowSettingsDialog(true)}
                            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-border hover:bg-bg-muted transition-colors group"
                        >
                            <SettingsIcon className="w-4 h-4 text-fg-secondary" />
                            <span className="flex-1 text-sm text-fg">Settings</span>
                            <kbd className="text-[10px] px-1.5 py-0.5 bg-bg-muted rounded text-fg-muted border border-border">,</kbd>
                        </button>
                    </div>

                    <p className="text-xs text-fg-muted mt-8">
                        Press <kbd className="px-1 py-0.5 bg-bg-muted rounded text-[10px] border border-border">?</kbd> for keyboard shortcuts
                    </p>
                </div>
            </div>
        );
    };

    return (
        <>
            <Head title="Dashboard" />

            <div className="h-screen w-full flex flex-col bg-bg overflow-hidden">
                {/* Main content */}
                <div className="flex-1 flex overflow-hidden">
                    <PanelGroup direction="horizontal" className="flex-1">
                        {/* Left: Task list */}
                        <Panel defaultSize={22} minSize={16} maxSize={32}>
                            <TaskPanel />
                        </Panel>

                        <PanelResizeHandle className="w-px bg-border hover:bg-fg-muted hover:w-0.5 transition-all cursor-col-resize" />

                        {/* Center: Chat */}
                        <Panel minSize={40}>
                            <div className="h-full bg-bg">
                                <ChatPanel />
                            </div>
                        </Panel>

                        {/* Right: Changes or Terminal */}
                        {currentTodo && currentWorktree && rightPanel && (
                            <>
                                <PanelResizeHandle className="w-px bg-border hover:bg-fg-muted hover:w-0.5 transition-all cursor-col-resize" />
                                <Panel defaultSize={22} minSize={15} maxSize={35}>
                                    {rightPanel === 'changes' ? (
                                        <ChangesPanel
                                            worktree={currentWorktree}
                                            todo={currentTodo}
                                            initialStatus={status}
                                            initialDiff={diff}
                                        />
                                    ) : (
                                        <TerminalPanel
                                            todoId={currentTodo.id}
                                            workingDirectory={currentWorktree.path}
                                        />
                                    )}
                                </Panel>
                            </>
                        )}
                    </PanelGroup>
                </div>

                {/* Status bar */}
                <div className="h-6 bg-bg-secondary border-t border-border flex items-center px-3 text-[11px] text-fg-muted shrink-0">
                    <div className="flex items-center gap-3">
                        {currentTodo && currentWorktree && (
                            <>
                                <span className="flex items-center gap-1">
                                    <GitBranchIcon className="w-3 h-3" />
                                    {currentWorktree.branch || 'main'}
                                </span>
                                <span className="flex items-center gap-1">
                                    <FolderIcon className="w-3 h-3" />
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
                                <span className="w-2.5 h-2.5 border-[1.5px] border-fg-muted border-t-fg rounded-full animate-spin" />
                                {runningSessions.length} running
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Dialogs */}
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

            <SettingsDialog
                show={showSettingsDialog}
                onClose={() => setShowSettingsDialog(false)}
            />

            <KeyboardShortcutsHelp
                show={showKeyboardHelp}
                onClose={() => setShowKeyboardHelp(false)}
            />

            {/* Sequence indicator */}
            {sequenceBuffer.length > 0 && (
                <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50">
                    <div className="px-3 py-1.5 bg-fg text-accent-fg rounded-md shadow-lg text-sm font-mono">
                        {sequenceBuffer.map((key, i) => (
                            <span key={i}>
                                {i > 0 && <span className="mx-1 opacity-50">&rarr;</span>}
                                <span>{key}</span>
                            </span>
                        ))}
                        <span className="ml-1 animate-pulse-subtle">...</span>
                    </div>
                </div>
            )}

            {/* Floating Task Menu */}
            {openMenuId !== null && menuPosition && (
                <>
                    <div
                        className="fixed inset-0 z-[9998]"
                        onClick={() => { setOpenMenuId(null); setMenuPosition(null); }}
                    />
                    <ul
                        className="fixed bg-bg rounded-lg shadow-xl border border-border w-44 p-1 z-[9999]"
                        style={{ top: menuPosition.top, left: menuPosition.left }}
                    >
                        <li>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const todo = todos.find(t => t.id === openMenuId);
                                    if (todo) setEditingTodo(todo);
                                    setOpenMenuId(null); setMenuPosition(null);
                                }}
                                className="w-full flex items-center gap-2 text-xs px-3 py-2 rounded-md hover:bg-bg-muted text-fg-secondary"
                            >
                                <EditIcon className="w-3.5 h-3.5" /> Edit
                            </button>
                        </li>
                        <li>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (openMenuId) handleDuplicateTask(openMenuId);
                                }}
                                className="w-full flex items-center gap-2 text-xs px-3 py-2 rounded-md hover:bg-bg-muted text-fg-secondary"
                            >
                                <CopyIcon className="w-3.5 h-3.5" /> Duplicate
                            </button>
                        </li>

                        {/* Status change options */}
                        <li className="border-t border-border my-1" />
                        <li className="px-3 py-1">
                            <span className="text-[10px] font-medium text-fg-muted uppercase tracking-wider">Move to</span>
                        </li>
                        {(() => {
                            const todo = todos.find(t => t.id === openMenuId);
                            if (!todo) return null;
                            return STATUS_GROUPS.filter(g => !g.statuses.includes(todo.status)).map(group => (
                                <li key={group.key}>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (openMenuId) handleStatusChange(openMenuId, group.statuses[0]);
                                        }}
                                        className="w-full flex items-center gap-2 text-xs px-3 py-2 rounded-md hover:bg-bg-muted text-fg-secondary"
                                    >
                                        <span className={`w-2 h-2 rounded-full ${group.dotClass}`} />
                                        {group.label}
                                    </button>
                                </li>
                            ));
                        })()}

                        <li className="border-t border-border my-1" />
                        <li>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (openMenuId) handleArchiveTask(openMenuId);
                                }}
                                className="w-full flex items-center gap-2 text-xs px-3 py-2 rounded-md hover:bg-bg-muted text-error"
                            >
                                <ArchiveIcon className="w-3.5 h-3.5" /> Archive
                            </button>
                        </li>
                    </ul>
                </>
            )}

            {/* Edit Task Dialog */}
            <EditTaskDialog
                todo={editingTodo}
                onClose={() => setEditingTodo(null)}
            />
        </>
    );
}

// Edit Task Dialog
function EditTaskDialog({ todo, onClose }: { todo: Todo | null; onClose: () => void }) {
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

    const modelInfo: Record<string, { name: string; desc: string }> = {
        sonnet: { name: 'Sonnet', desc: 'Fast & efficient' },
        opus: { name: 'Opus', desc: 'Most capable' },
        haiku: { name: 'Haiku', desc: 'Fastest' },
    };

    return (
        <Transition show={show} as={Fragment}>
            <Dialog as="div" className="relative z-50" onClose={onClose}>
                <TransitionChild
                    as={Fragment}
                    enter="ease-out duration-200"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-150"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
                </TransitionChild>

                <div className="fixed inset-0 overflow-y-auto">
                    <div className="flex min-h-full items-center justify-center p-4">
                        <TransitionChild
                            as={Fragment}
                            enter="ease-out duration-200"
                            enterFrom="opacity-0 scale-95"
                            enterTo="opacity-100 scale-100"
                            leave="ease-in duration-150"
                            leaveFrom="opacity-100 scale-100"
                            leaveTo="opacity-0 scale-95"
                        >
                            <DialogPanel className="w-full max-w-lg transform rounded-lg bg-bg border border-border shadow-2xl transition-all">
                                {/* Header */}
                                <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                                    <h2 className="text-base font-semibold text-fg">Edit Task</h2>
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        className="p-1 text-fg-muted hover:text-fg hover:bg-bg-muted rounded-md transition-colors"
                                    >
                                        <XIcon className="w-4 h-4" />
                                    </button>
                                </div>

                                <form id="edit-task-form" onSubmit={handleSubmit} className="p-6">
                                    {/* Tabs */}
                                    <div className="flex gap-1 p-0.5 bg-bg-muted rounded-md mb-5">
                                        {tabs.map((tab) => (
                                            <button
                                                key={tab.key}
                                                type="button"
                                                onClick={() => setActiveTab(tab.key)}
                                                className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                                                    activeTab === tab.key
                                                        ? 'bg-bg text-fg shadow-sm'
                                                        : 'text-fg-muted hover:text-fg-secondary'
                                                }`}
                                            >
                                                {tab.name}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Task Tab */}
                                    {activeTab === 0 && (
                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-xs font-medium text-fg-secondary mb-1.5 block">Title</label>
                                                <input
                                                    type="text"
                                                    value={title}
                                                    onChange={(e) => setTitle(e.target.value)}
                                                    placeholder="Task title"
                                                    className="w-full px-3 py-2 bg-bg-secondary border border-border rounded-md text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-1 focus:ring-ring"
                                                    required
                                                />
                                            </div>

                                            <div>
                                                <label className="text-xs font-medium text-fg-secondary mb-1.5 block">Context</label>
                                                <textarea
                                                    value={context}
                                                    onChange={(e) => setContext(e.target.value)}
                                                    placeholder="Context for Claude..."
                                                    className="w-full px-3 py-2 bg-bg-secondary border border-border rounded-md text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-1 focus:ring-ring min-h-[100px] resize-y"
                                                />
                                            </div>

                                            <div>
                                                <label className="text-xs font-medium text-fg-secondary mb-1.5 block">Model</label>
                                                <div className="grid grid-cols-3 gap-2">
                                                    {(['sonnet', 'opus', 'haiku'] as const).map((m) => (
                                                        <button
                                                            key={m}
                                                            type="button"
                                                            onClick={() => setModel(m)}
                                                            className={`p-3 text-left rounded-md border transition-colors ${
                                                                model === m
                                                                    ? 'border-fg bg-bg-muted'
                                                                    : 'border-border hover:border-border-strong hover:bg-bg-secondary'
                                                            }`}
                                                        >
                                                            <div className={`text-xs font-medium ${model === m ? 'text-fg' : 'text-fg-secondary'}`}>
                                                                {modelInfo[m].name}
                                                            </div>
                                                            <div className="text-[10px] text-fg-muted mt-0.5">{modelInfo[m].desc}</div>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Hooks Tab */}
                                    {activeTab === 1 && (
                                        <div className="space-y-4">
                                            {[
                                                { label: 'Pre-Command', value: preCommand, set: setPreCommand, placeholder: 'e.g., npm install' },
                                                { label: 'Post-Command', value: postCommand, set: setPostCommand, placeholder: 'e.g., npm test' },
                                            ].map(({ label, value, set, placeholder }) => (
                                                <div key={label}>
                                                    <label className="text-xs font-medium text-fg-secondary mb-1.5 block">{label}</label>
                                                    <input
                                                        type="text"
                                                        value={value}
                                                        onChange={(e) => set(e.target.value)}
                                                        placeholder={placeholder}
                                                        className="w-full px-3 py-2 bg-bg-secondary border border-border rounded-md text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                                                    />
                                                </div>
                                            ))}

                                            {[
                                                { label: 'Message Prefix', value: messagePrefix, set: setMessagePrefix },
                                                { label: 'Message Suffix', value: messageSuffix, set: setMessageSuffix },
                                            ].map(({ label, value, set }) => (
                                                <div key={label}>
                                                    <label className="text-xs font-medium text-fg-secondary mb-1.5 block">{label}</label>
                                                    <textarea
                                                        value={value}
                                                        onChange={(e) => set(e.target.value)}
                                                        placeholder={`Text to ${label.toLowerCase().includes('prefix') ? 'prepend' : 'append'}...`}
                                                        className="w-full px-3 py-2 bg-bg-secondary border border-border rounded-md text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-1 focus:ring-ring min-h-[72px] resize-y"
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Actions */}
                                    <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-border">
                                        <button
                                            type="button"
                                            onClick={onClose}
                                            className="px-4 py-2 text-xs font-medium text-fg-secondary hover:text-fg hover:bg-bg-muted rounded-md transition-colors"
                                            disabled={isSubmitting}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            className={`px-4 py-2 text-xs font-medium rounded-md transition-colors ${
                                                !isSubmitting && title.trim()
                                                    ? 'bg-fg text-accent-fg hover:opacity-90'
                                                    : 'bg-bg-muted text-fg-muted cursor-not-allowed'
                                            }`}
                                            disabled={isSubmitting || !title.trim()}
                                        >
                                            {isSubmitting ? 'Saving...' : 'Save Changes'}
                                        </button>
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
