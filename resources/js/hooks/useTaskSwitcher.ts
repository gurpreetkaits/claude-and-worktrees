import { useState, useCallback, useRef, useEffect } from 'react';
import { router } from '@inertiajs/react';
import { Todo, Message } from '@/types';

interface TaskCache {
    messages: Message[];
    loadedAt: number;
}

interface UseTaskSwitcherOptions {
    todos: Todo[];
    initialActiveTodo?: Todo | null;
}

interface UseTaskSwitcherReturn {
    activeTodo: Todo | null;
    messages: Message[];
    isLoading: boolean;
    switchToTask: (todoId: number) => void;
    switchToNext: () => void;
    switchToPrevious: () => void;
    switchToIndex: (index: number) => void;
    refreshMessages: () => void;
    addMessage: (message: Message) => void;
    updateMessages: (messages: Message[]) => void;
}

export function useTaskSwitcher({
    todos,
    initialActiveTodo,
}: UseTaskSwitcherOptions): UseTaskSwitcherReturn {
    const [activeTodoId, setActiveTodoId] = useState<number | null>(
        initialActiveTodo?.id ?? null
    );
    const [messages, setMessages] = useState<Message[]>(
        initialActiveTodo?.messages ?? []
    );
    const [isLoading, setIsLoading] = useState(false);

    // Cache for loaded messages
    const cacheRef = useRef<Map<number, TaskCache>>(new Map());

    // Cache TTL in ms (5 minutes)
    const CACHE_TTL = 5 * 60 * 1000;

    // Get active todo from todos array
    const activeTodo = todos.find((t) => t.id === activeTodoId) ?? null;

    // Initialize cache with all todos that have messages
    useEffect(() => {
        const now = Date.now();
        todos.forEach((todo) => {
            if (todo.messages && todo.messages.length > 0 && !cacheRef.current.has(todo.id)) {
                cacheRef.current.set(todo.id, {
                    messages: todo.messages,
                    loadedAt: now,
                });
            }
        });
        // Also ensure initial active todo is cached
        if (initialActiveTodo?.messages && initialActiveTodo.messages.length > 0) {
            cacheRef.current.set(initialActiveTodo.id, {
                messages: initialActiveTodo.messages,
                loadedAt: now,
            });
        }
    }, [todos, initialActiveTodo]);

    // Load messages for a todo
    const loadMessages = useCallback(async (todoId: number): Promise<Message[]> => {
        // Check cache first
        const cached = cacheRef.current.get(todoId);
        if (cached && Date.now() - cached.loadedAt < CACHE_TTL) {
            return cached.messages;
        }

        // Fetch from server using the messages API endpoint
        try {
            const response = await fetch(route('messages.index', todoId), {
                headers: {
                    Accept: 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                },
            });

            if (!response.ok) {
                throw new Error('Failed to load messages');
            }

            const data = await response.json();
            const loadedMessages = data.messages ?? [];

            // Update cache
            cacheRef.current.set(todoId, {
                messages: loadedMessages,
                loadedAt: Date.now(),
            });

            return loadedMessages;
        } catch (error) {
            console.error('Failed to load messages:', error);
            return cached?.messages ?? [];
        }
    }, []);

    // Track current task ID in ref for async callbacks
    const currentTaskRef = useRef<number | null>(activeTodoId);
    currentTaskRef.current = activeTodoId;

    // Switch to a specific task - INSTANT, no async
    const switchToTask = useCallback(
        (todoId: number) => {
            if (todoId === activeTodoId) return;

            // Update URL immediately
            window.history.pushState({}, '', route('dashboard.todo', todoId));

            // Check cache first (instant)
            const cached = cacheRef.current.get(todoId);
            if (cached) {
                // Instant switch with cached messages
                setActiveTodoId(todoId);
                setMessages(cached.messages);
                return;
            }

            // Check if todo has messages inline
            const todo = todos.find((t) => t.id === todoId);
            if (todo?.messages && todo.messages.length > 0) {
                // Cache and switch instantly
                cacheRef.current.set(todoId, {
                    messages: todo.messages,
                    loadedAt: Date.now(),
                });
                setActiveTodoId(todoId);
                setMessages(todo.messages);
                return;
            }

            // No cached messages - switch immediately with empty, load in background
            setActiveTodoId(todoId);
            setMessages([]);
            setIsLoading(true);

            // Load messages in background
            loadMessages(todoId).then((loadedMessages) => {
                // Only update if still on the same task
                if (currentTaskRef.current === todoId) {
                    setMessages(loadedMessages);
                    setIsLoading(false);
                }
            });
        },
        [activeTodoId, todos, loadMessages]
    );

    // Switch to next task
    const switchToNext = useCallback(() => {
        if (todos.length === 0) return;

        const currentIndex = activeTodoId
            ? todos.findIndex((t) => t.id === activeTodoId)
            : -1;
        const nextIndex = currentIndex < todos.length - 1 ? currentIndex + 1 : 0;
        switchToTask(todos[nextIndex].id);
    }, [todos, activeTodoId, switchToTask]);

    // Switch to previous task
    const switchToPrevious = useCallback(() => {
        if (todos.length === 0) return;

        const currentIndex = activeTodoId
            ? todos.findIndex((t) => t.id === activeTodoId)
            : -1;
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : todos.length - 1;
        switchToTask(todos[prevIndex].id);
    }, [todos, activeTodoId, switchToTask]);

    // Switch to task by index (1-9)
    const switchToIndex = useCallback(
        (index: number) => {
            if (index >= 0 && index < todos.length) {
                switchToTask(todos[index].id);
            }
        },
        [todos, switchToTask]
    );

    // Refresh messages for current task
    const refreshMessages = useCallback(async () => {
        if (!activeTodoId) return;

        // Clear cache for this task
        cacheRef.current.delete(activeTodoId);

        setIsLoading(true);
        const loadedMessages = await loadMessages(activeTodoId);
        setMessages(loadedMessages);
        setIsLoading(false);
    }, [activeTodoId, loadMessages]);

    // Add a single message to the current task (prevents duplicates)
    const addMessage = useCallback((message: Message) => {
        if (!activeTodoId) return;

        setMessages((prev) => {
            // Check if message already exists (prevent duplicates)
            if (prev.some((m) => m.id === message.id)) {
                return prev; // No change, message already exists
            }

            const newMessages = [...prev, message];
            // Update cache
            cacheRef.current.set(activeTodoId, {
                messages: newMessages,
                loadedAt: Date.now(),
            });
            return newMessages;
        });
    }, [activeTodoId]);

    // Update all messages for current task
    const updateMessages = useCallback((newMessages: Message[]) => {
        if (!activeTodoId) return;

        setMessages(newMessages);
        // Update cache
        cacheRef.current.set(activeTodoId, {
            messages: newMessages,
            loadedAt: Date.now(),
        });
    }, [activeTodoId]);

    // Prefetch adjacent tasks on idle - only when active task changes
    const todosRef = useRef(todos);
    todosRef.current = todos;

    useEffect(() => {
        if (!activeTodoId) return;

        const currentTodos = todosRef.current;
        if (currentTodos.length <= 1) return;

        const currentIndex = currentTodos.findIndex((t) => t.id === activeTodoId);
        if (currentIndex === -1) return;

        const prefetchIds: number[] = [];

        // Prefetch next and previous
        if (currentIndex > 0) {
            prefetchIds.push(currentTodos[currentIndex - 1].id);
        }
        if (currentIndex < currentTodos.length - 1) {
            prefetchIds.push(currentTodos[currentIndex + 1].id);
        }

        // Use requestIdleCallback for prefetching
        const prefetch = () => {
            prefetchIds.forEach((id) => {
                if (!cacheRef.current.has(id)) {
                    loadMessages(id); // Fire and forget
                }
            });
        };

        if ('requestIdleCallback' in window) {
            const handle = (window as any).requestIdleCallback(prefetch);
            return () => (window as any).cancelIdleCallback(handle);
        } else {
            const handle = setTimeout(prefetch, 100);
            return () => clearTimeout(handle);
        }
    }, [activeTodoId, loadMessages]); // Removed todos from deps - use ref instead

    return {
        activeTodo,
        messages,
        isLoading,
        switchToTask,
        switchToNext,
        switchToPrevious,
        switchToIndex,
        refreshMessages,
        addMessage,
        updateMessages,
    };
}
