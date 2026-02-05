import { useState, useCallback, useRef, useEffect, useSyncExternalStore } from 'react';
import { Message } from '@/types';

// Check if WebSocket (Echo) is available and connected
function isWebSocketAvailable(): boolean {
    if (!window.Echo?.connector?.pusher?.connection) {
        return false;
    }
    return window.Echo.connector.pusher.connection.state === 'connected';
}

// Play notification sound when any session completes
function playNotificationSound() {
    try {
        const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const playTone = (frequency: number, startTime: number, duration: number) => {
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            oscillator.frequency.value = frequency;
            oscillator.type = 'sine';
            gainNode.gain.setValueAtTime(0, startTime);
            gainNode.gain.linearRampToValueAtTime(0.3, startTime + 0.05);
            gainNode.gain.linearRampToValueAtTime(0, startTime + duration);
            oscillator.start(startTime);
            oscillator.stop(startTime + duration);
        };
        const now = audioContext.currentTime;
        playTone(880, now, 0.15);
        playTone(1100, now + 0.15, 0.2);
    } catch {
        // Audio not available
    }
}

interface ToolUse {
    id: string | null;
    tool: string;
    input: Record<string, unknown>;
}

interface ToolResult {
    tool_use_id: string | null;
    content: string;
    is_error: boolean;
}

interface BlockedCommand {
    tool: string;
    reason: string;
    timestamp: number;
}

interface CommandExecution {
    command: string;
    status: 'running' | 'completed' | 'failed';
    output?: string;
    error?: string;
    exitCode?: number;
}

interface HookExecution {
    hookId: string | null;
    event: string;
    command: string;
    status: 'running' | 'completed' | 'failed';
    output?: string;
    error?: string;
}

// Image attachment for sending with messages
export interface MessageImage {
    data: string; // base64 data
    mediaType: string; // e.g., 'image/png'
}

// Queued message with optional images
interface QueuedMessage {
    content: string;
    images?: MessageImage[];
}

export interface SessionState {
    isStreaming: boolean;
    currentText: string;
    sessionKey: string | null;
    error: string | null;
    toolUses: ToolUse[];
    toolResults: ToolResult[];
    thinking: string;
    costUsd: number | null;
    durationMs: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
    queuedMessages: QueuedMessage[];
    lastCompletedMessage: Message | null;
    lastUserMessage: Message | null;
    completionCount: number;
    draftInput: string;
    blockedCommands: BlockedCommand[];
    preCommand: CommandExecution | null;
    postCommand: CommandExecution | null;
    hooks: HookExecution[];
}

const initialSessionState: SessionState = {
    isStreaming: false,
    currentText: '',
    sessionKey: null,
    error: null,
    toolUses: [],
    toolResults: [],
    thinking: '',
    costUsd: null,
    durationMs: null,
    inputTokens: null,
    outputTokens: null,
    queuedMessages: [],
    lastCompletedMessage: null,
    lastUserMessage: null,
    completionCount: 0,
    draftInput: '',
    blockedCommands: [],
    preCommand: null,
    postCommand: null,
    hooks: [],
};

// Listener types
type SessionListener = (todoId: number, session: SessionState) => void;
type RunningListener = (running: number[]) => void;

// All event types that Claude can emit via WebSocket
const CLAUDE_EVENTS = [
    'user_message',
    'session_started',
    'session_resumed',
    'system',
    'assistant_message_created',
    'text_delta',
    'thinking',
    'tool_use',
    'tool_result',
    'permission_request',
    'permission_approved',
    'permission_denied',
    'result',
    'complete',
    'error',
    'debug',
    'pre_command_start',
    'pre_command_result',
    'post_command_start',
    'post_command_result',
    'hook_executed',
    'queued_message_pending',
    'cancellation_requested',
    'cancellation_acknowledged',
    'cancelled',
    'shutdown_initiated',
];

// Global session manager with WebSocket + SSE support
class ConcurrentSessionManager {
    private sessions: Map<number, SessionState> = new Map();
    private abortControllers: Map<number, AbortController> = new Map();
    private sessionListeners: Map<number, Set<SessionListener>> = new Map();
    private runningListeners: Set<RunningListener> = new Set();
    private version = 0;

    // WebSocket channel subscriptions
    private wsChannels: Map<number, ReturnType<typeof window.Echo.channel>> = new Map();

    getSession(todoId: number): SessionState {
        return this.sessions.get(todoId) || { ...initialSessionState };
    }

    getVersion(): number {
        return this.version;
    }

    getAllRunningSessions(): number[] {
        return Array.from(this.sessions.entries())
            .filter(([, state]) => state.isStreaming)
            .map(([todoId]) => todoId);
    }

    private updateSession(todoId: number, updates: Partial<SessionState>) {
        const current = this.getSession(todoId);
        const updated = { ...current, ...updates };
        this.sessions.set(todoId, updated);
        this.version++;

        // Notify session-specific listeners
        const listeners = this.sessionListeners.get(todoId);
        if (listeners) {
            listeners.forEach(listener => listener(todoId, updated));
        }

        // Notify running listeners only if isStreaming changed
        if ('isStreaming' in updates) {
            const running = this.getAllRunningSessions();
            this.runningListeners.forEach(listener => listener(running));
        }
    }

    subscribeToSession(todoId: number, listener: SessionListener): () => void {
        if (!this.sessionListeners.has(todoId)) {
            this.sessionListeners.set(todoId, new Set());
        }
        this.sessionListeners.get(todoId)!.add(listener);
        return () => {
            this.sessionListeners.get(todoId)?.delete(listener);
        };
    }

    subscribeToRunning(listener: RunningListener): () => void {
        this.runningListeners.add(listener);
        return () => this.runningListeners.delete(listener);
    }

    async sendMessage(todoId: number, content: string, images?: MessageImage[]): Promise<void> {
        const currentSession = this.getSession(todoId);
        if (currentSession.isStreaming) {
            this.updateSession(todoId, { queuedMessages: [...currentSession.queuedMessages, { content, images }] });
            return;
        }

        this.updateSession(todoId, {
            isStreaming: true,
            currentText: '',
            sessionKey: null,
            error: null,
            toolUses: [],
            toolResults: [],
            thinking: '',
            costUsd: null,
            durationMs: null,
            inputTokens: null,
            outputTokens: null,
            blockedCommands: [],
            preCommand: null,
            postCommand: null,
            hooks: [],
        });

        // Use WebSocket when available for parallel processing support
        const useWebSocket = isWebSocketAvailable();
        console.log(`[SessionManager] Sending message via ${useWebSocket ? 'WebSocket' : 'SSE'}`);

        if (useWebSocket) {
            await this.sendViaWebSocket(todoId, content, images);
        } else {
            await this.sendViaSSE(todoId, content, images);
        }
    }

    // Subscribe to WebSocket channel for a todo
    private subscribeToChannel(todoId: number): Promise<void> {
        return new Promise((resolve) => {
            if (this.wsChannels.has(todoId)) {
                resolve(); // Already subscribed
                return;
            }

            if (!window.Echo) {
                console.warn('[SessionManager] Echo not available for WebSocket');
                resolve();
                return;
            }

            const channelName = `claude.todo.${todoId}`;
            console.log(`[SessionManager] Subscribing to WebSocket channel: ${channelName}`);

            const channel = window.Echo.channel(channelName);

            // Listen to all Claude events
            CLAUDE_EVENTS.forEach((event) => {
                channel.listen(`.${event}`, (data: Record<string, unknown>) => {
                    console.log(`[SessionManager] WS event ${event}:`, data);
                    this.handleEvent(todoId, event, data);
                });
            });

            this.wsChannels.set(todoId, channel);

            // Wait for subscription to be established
            // Pusher/Echo channels emit 'pusher:subscription_succeeded' when ready
            if (channel.pusher?.subscriptionPending) {
                channel.pusher.bind('pusher:subscription_succeeded', () => {
                    console.log(`[SessionManager] Channel ${channelName} subscribed`);
                    resolve();
                });
                // Timeout fallback
                setTimeout(resolve, 500);
            } else {
                // Already subscribed or subscription immediate
                setTimeout(resolve, 100); // Small delay to ensure listeners are ready
            }
        });
    }

    // Unsubscribe from WebSocket channel
    private unsubscribeFromChannel(todoId: number): void {
        if (window.Echo && this.wsChannels.has(todoId)) {
            window.Echo.leave(`claude.todo.${todoId}`);
            this.wsChannels.delete(todoId);
            console.log(`[SessionManager] Left WebSocket channel for todo ${todoId}`);
        }
    }

    // Send message via WebSocket (dispatches job, receives events via Echo)
    private async sendViaWebSocket(todoId: number, content: string, images?: MessageImage[]): Promise<void> {
        // Subscribe to channel and wait for it to be ready before sending
        await this.subscribeToChannel(todoId);

        const streamUrl = route('claude.stream.ws', todoId);

        try {
            const response = await fetch(streamUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content || '',
                },
                body: JSON.stringify({ message: content, images: images || [] }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
            }

            // Job dispatched - events will come via WebSocket
            console.log('[SessionManager] WebSocket job dispatched, awaiting events');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.updateSession(todoId, { isStreaming: false, error: errorMessage });
        }
    }

    // Send message via SSE (traditional streaming)
    private async sendViaSSE(todoId: number, content: string, images?: MessageImage[]): Promise<void> {
        const abortController = new AbortController();
        this.abortControllers.set(todoId, abortController);

        const streamUrl = route('claude.stream', todoId);

        try {
            const response = await fetch(streamUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'text/event-stream',
                    'X-CSRF-TOKEN': document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content || '',
                },
                body: JSON.stringify({ message: content, images: images || [] }),
                signal: abortController.signal,
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error('No response body');
            }

            const decoder = new TextDecoder();
            let buffer = '';
            let currentEvent = '';

            while (true) {
                // Check if aborted
                if (abortController.signal.aborted) {
                    reader.cancel();
                    break;
                }

                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('event: ')) {
                        currentEvent = line.slice(7).trim();
                    } else if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (currentEvent && data) {
                            try {
                                const parsed = JSON.parse(data);
                                this.handleEvent(todoId, currentEvent, parsed);
                            } catch {
                                // JSON parse error - skip malformed event
                            }
                        }
                        currentEvent = '';
                    }
                }
            }

            this.updateSession(todoId, { isStreaming: false });
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                this.updateSession(todoId, { isStreaming: false });
            } else {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                this.updateSession(todoId, { isStreaming: false, error: errorMessage });
            }
        }

        // Check for queued messages (SSE only - WebSocket handles via complete event)
        this.processQueuedMessages(todoId);
    }

    // Process queued messages after stream completes
    private processQueuedMessages(todoId: number): void {
        const finalSession = this.getSession(todoId);
        if (finalSession.queuedMessages.length > 0) {
            const [nextMessage, ...remainingMessages] = finalSession.queuedMessages;
            this.updateSession(todoId, { queuedMessages: remainingMessages });
            setTimeout(() => this.sendMessage(todoId, nextMessage.content, nextMessage.images), 100);
        }
    }

    private handleEvent(todoId: number, event: string, data: Record<string, unknown>) {
        const session = this.getSession(todoId);

        switch (event) {
            case 'user_message':
                this.updateSession(todoId, { lastUserMessage: data.message as Message });
                break;

            case 'session_started':
                this.updateSession(todoId, { sessionKey: data.session_key as string });
                break;

            case 'text_delta':
                const deltaText = (data.text as string) || '';
                const fullContent = (data.full_content as string) || '';
                this.updateSession(todoId, {
                    currentText: fullContent || session.currentText + deltaText,
                });
                break;

            case 'thinking':
                this.updateSession(todoId, {
                    thinking: session.thinking + ((data.content as string) || ''),
                });
                break;

            case 'tool_use':
                this.updateSession(todoId, {
                    toolUses: [...session.toolUses, {
                        id: data.id as string | null,
                        tool: data.tool as string,
                        input: data.input as Record<string, unknown>,
                    }],
                });
                break;

            case 'tool_result':
                this.updateSession(todoId, {
                    toolResults: [...session.toolResults, {
                        tool_use_id: data.tool_use_id as string | null,
                        content: data.content as string,
                        is_error: data.is_error as boolean,
                    }],
                });
                break;

            case 'result':
                this.updateSession(todoId, {
                    costUsd: data.cost_usd as number | null,
                    durationMs: data.duration_ms as number | null,
                });
                break;

            case 'complete':
                this.updateSession(todoId, {
                    isStreaming: false,
                    currentText: (data.message as Message)?.content || session.currentText,
                    lastCompletedMessage: data.message as Message,
                    completionCount: session.completionCount + 1,
                });
                playNotificationSound();
                // Process queued messages for WebSocket mode
                this.processQueuedMessages(todoId);
                break;

            case 'error':
                this.updateSession(todoId, {
                    isStreaming: false,
                    error: data.message as string,
                });
                break;

            case 'permission_denied':
                this.updateSession(todoId, {
                    blockedCommands: [...session.blockedCommands, {
                        tool: data.tool as string,
                        reason: data.reason as string,
                        timestamp: Date.now(),
                    }],
                });
                break;

            case 'pre_command_start':
                this.updateSession(todoId, {
                    preCommand: {
                        command: data.command as string,
                        status: 'running',
                    },
                });
                break;

            case 'pre_command_result':
                this.updateSession(todoId, {
                    preCommand: {
                        command: session.preCommand?.command || '',
                        status: (data.success as boolean) ? 'completed' : 'failed',
                        output: data.output as string | undefined,
                        error: data.error as string | undefined,
                        exitCode: data.exit_code as number | undefined,
                    },
                });
                break;

            case 'post_command_start':
                this.updateSession(todoId, {
                    postCommand: {
                        command: data.command as string,
                        status: 'running',
                    },
                });
                break;

            case 'post_command_result':
                this.updateSession(todoId, {
                    postCommand: {
                        command: session.postCommand?.command || '',
                        status: (data.success as boolean) ? 'completed' : 'failed',
                        output: data.output as string | undefined,
                        error: data.error as string | undefined,
                        exitCode: data.exit_code as number | undefined,
                    },
                });
                break;

            case 'hook_executed':
                this.updateSession(todoId, {
                    hooks: [...session.hooks, {
                        hookId: data.hook_id as string | null,
                        event: data.event as string,
                        command: data.command as string,
                        status: (data.success as boolean) ? 'completed' : 'failed',
                        output: data.output as string | undefined,
                        error: data.error as string | undefined,
                    }],
                });
                break;

            case 'cancellation_requested':
                console.log(`[SessionManager] Cancellation requested for todo ${todoId}`);
                break;

            case 'cancellation_acknowledged':
                console.log(`[SessionManager] Cancellation acknowledged for todo ${todoId}:`, data.message);
                break;

            case 'cancelled':
                this.updateSession(todoId, {
                    isStreaming: false,
                    currentText: (data.message as Message)?.content || session.currentText,
                    lastCompletedMessage: data.message as Message,
                });
                console.log(`[SessionManager] Task cancelled for todo ${todoId}`);
                break;

            case 'shutdown_initiated':
                console.log(`[SessionManager] Shutdown initiated for todo ${todoId}`);
                break;
        }
    }

    async cancel(todoId: number): Promise<void> {
        const abortController = this.abortControllers.get(todoId);

        // Abort SSE stream if active
        if (abortController) {
            abortController.abort();
            this.abortControllers.delete(todoId);
        }

        // Update state immediately
        this.updateSession(todoId, { isStreaming: false, queuedMessages: [] });

        // Cancel on backend via TaskManager (works for both WebSocket and SSE modes)
        try {
            await fetch(route('claude.cancel.todo', todoId), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content || '',
                },
            });
            console.log(`[SessionManager] Cancellation request sent for todo ${todoId}`);
        } catch (error) {
            console.error(`[SessionManager] Failed to send cancellation for todo ${todoId}:`, error);
        }

        // Note: Keep WebSocket channel subscribed for potential future messages
        // The channel is lightweight and can receive multiple conversations
    }

    queueMessage(todoId: number, content: string, images?: MessageImage[]) {
        const session = this.getSession(todoId);
        this.updateSession(todoId, { queuedMessages: [...session.queuedMessages, { content, images }] });
    }

    clearQueue(todoId: number) {
        this.updateSession(todoId, { queuedMessages: [] });
    }

    clearQueueItem(todoId: number, index: number) {
        const session = this.getSession(todoId);
        const newQueue = session.queuedMessages.filter((_, i) => i !== index);
        this.updateSession(todoId, { queuedMessages: newQueue });
    }

    setDraftInput(todoId: number, input: string) {
        // Update draft without triggering session listeners (to avoid re-renders)
        const current = this.sessions.get(todoId) || { ...initialSessionState };
        current.draftInput = input;
        this.sessions.set(todoId, current);
        // Don't call updateSession to avoid unnecessary re-renders
    }

    getDraftInput(todoId: number): string {
        return this.sessions.get(todoId)?.draftInput || '';
    }
}

// Singleton instance
const sessionManager = new ConcurrentSessionManager();

// Hook for getting running sessions (only updates when running list changes)
export function useRunningSessions(): number[] {
    const [running, setRunning] = useState<number[]>(() => sessionManager.getAllRunningSessions());

    useEffect(() => {
        return sessionManager.subscribeToRunning(setRunning);
    }, []);

    return running;
}

// Hook for session actions (no re-renders)
export function useConcurrentSessions() {
    const sendMessage = useCallback((todoId: number, content: string, images?: MessageImage[]) => {
        return sessionManager.sendMessage(todoId, content, images);
    }, []);

    const cancel = useCallback((todoId: number) => {
        return sessionManager.cancel(todoId);
    }, []);

    const queueMessage = useCallback((todoId: number, content: string, images?: MessageImage[]) => {
        sessionManager.queueMessage(todoId, content, images);
    }, []);

    const clearQueue = useCallback((todoId: number) => {
        sessionManager.clearQueue(todoId);
    }, []);

    const clearQueueItem = useCallback((todoId: number, index: number) => {
        sessionManager.clearQueueItem(todoId, index);
    }, []);

    const getSession = useCallback((todoId: number) => {
        return sessionManager.getSession(todoId);
    }, []);

    const getRunningSessions = useCallback(() => {
        return sessionManager.getAllRunningSessions();
    }, []);

    const setDraftInput = useCallback((todoId: number, input: string) => {
        sessionManager.setDraftInput(todoId, input);
    }, []);

    const getDraftInput = useCallback((todoId: number) => {
        return sessionManager.getDraftInput(todoId);
    }, []);

    return {
        getSession,
        sendMessage,
        cancel,
        queueMessage,
        clearQueue,
        clearQueueItem,
        getRunningSessions,
        setDraftInput,
        getDraftInput,
    };
}

// Hook for a specific todo's session (only re-renders when this session changes)
export function useTodoSession(todoId: number) {
    const [session, setSession] = useState<SessionState>(() => sessionManager.getSession(todoId));
    const { sendMessage, cancel, queueMessage, clearQueue, clearQueueItem, setDraftInput, getDraftInput } = useConcurrentSessions();

    useEffect(() => {
        // Get initial state
        setSession(sessionManager.getSession(todoId));

        // Subscribe to updates for this specific todo
        return sessionManager.subscribeToSession(todoId, (_, newSession) => {
            setSession(newSession);
        });
    }, [todoId]);

    return {
        ...session,
        sendMessage: useCallback((content: string, images?: MessageImage[]) => sendMessage(todoId, content, images), [sendMessage, todoId]),
        cancel: useCallback(() => cancel(todoId), [cancel, todoId]),
        queueMessage: useCallback((content: string, images?: MessageImage[]) => queueMessage(todoId, content, images), [queueMessage, todoId]),
        clearQueue: useCallback(() => clearQueue(todoId), [clearQueue, todoId]),
        clearQueueItem: useCallback((index: number) => clearQueueItem(todoId, index), [clearQueueItem, todoId]),
        setDraftInput: useCallback((input: string) => setDraftInput(todoId, input), [setDraftInput, todoId]),
        getDraftInput: useCallback(() => getDraftInput(todoId), [getDraftInput, todoId]),
    };
}
