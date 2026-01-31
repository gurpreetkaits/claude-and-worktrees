import { useState, useCallback, useRef, useEffect, useSyncExternalStore } from 'react';
import { Message } from '@/types';

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
    queuedMessages: string[];
    lastCompletedMessage: Message | null;
    lastUserMessage: Message | null;
    completionCount: number;
    draftInput: string; // Persisted input per task
    blockedCommands: BlockedCommand[]; // Commands blocked for safety
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
    queuedMessages: [],
    lastCompletedMessage: null,
    lastUserMessage: null,
    completionCount: 0,
    draftInput: '',
    blockedCommands: [],
};

// Listener types
type SessionListener = (todoId: number, session: SessionState) => void;
type RunningListener = (running: number[]) => void;

// Global session manager
class ConcurrentSessionManager {
    private sessions: Map<number, SessionState> = new Map();
    private abortControllers: Map<number, AbortController> = new Map();
    private sessionListeners: Map<number, Set<SessionListener>> = new Map();
    private runningListeners: Set<RunningListener> = new Set();
    private version = 0;

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

    async sendMessage(todoId: number, content: string): Promise<void> {
        const currentSession = this.getSession(todoId);
        if (currentSession.isStreaming) {
            this.updateSession(todoId, { queuedMessages: [...currentSession.queuedMessages, content] });
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
            blockedCommands: [],
        });

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
                body: JSON.stringify({ message: content }),
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

        // Check for queued messages
        const finalSession = this.getSession(todoId);
        if (finalSession.queuedMessages.length > 0) {
            const [nextMessage, ...remainingMessages] = finalSession.queuedMessages;
            this.updateSession(todoId, { queuedMessages: remainingMessages });
            setTimeout(() => this.sendMessage(todoId, nextMessage), 100);
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
        }
    }

    async cancel(todoId: number): Promise<void> {
        const session = this.getSession(todoId);
        const abortController = this.abortControllers.get(todoId);

        // Abort immediately
        if (abortController) {
            abortController.abort();
            this.abortControllers.delete(todoId);
        }

        // Update state immediately
        this.updateSession(todoId, { isStreaming: false, queuedMessages: [] });

        // Try to cancel on backend (fire and forget)
        if (session.sessionKey) {
            fetch(route('claude.cancel', session.sessionKey), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content || '',
                },
            }).catch(() => {});
        }
    }

    queueMessage(todoId: number, content: string) {
        const session = this.getSession(todoId);
        this.updateSession(todoId, { queuedMessages: [...session.queuedMessages, content] });
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
    const sendMessage = useCallback((todoId: number, content: string) => {
        return sessionManager.sendMessage(todoId, content);
    }, []);

    const cancel = useCallback((todoId: number) => {
        return sessionManager.cancel(todoId);
    }, []);

    const queueMessage = useCallback((todoId: number, content: string) => {
        sessionManager.queueMessage(todoId, content);
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
        sendMessage: useCallback((content: string) => sendMessage(todoId, content), [sendMessage, todoId]),
        cancel: useCallback(() => cancel(todoId), [cancel, todoId]),
        queueMessage: useCallback((content: string) => queueMessage(todoId, content), [queueMessage, todoId]),
        clearQueue: useCallback(() => clearQueue(todoId), [clearQueue, todoId]),
        clearQueueItem: useCallback((index: number) => clearQueueItem(todoId, index), [clearQueueItem, todoId]),
        setDraftInput: useCallback((input: string) => setDraftInput(todoId, input), [setDraftInput, todoId]),
        getDraftInput: useCallback(() => getDraftInput(todoId), [getDraftInput, todoId]),
    };
}
