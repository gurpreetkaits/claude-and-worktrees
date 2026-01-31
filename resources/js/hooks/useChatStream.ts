import { useState, useCallback, useRef } from 'react';
import { Message } from '@/types';

// Play a pleasant notification sound using Web Audio API
function playNotificationSound() {
    try {
        const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();

        // Create a pleasant two-tone notification
        const playTone = (frequency: number, startTime: number, duration: number) => {
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.frequency.value = frequency;
            oscillator.type = 'sine';

            // Fade in and out for a softer sound
            gainNode.gain.setValueAtTime(0, startTime);
            gainNode.gain.linearRampToValueAtTime(0.3, startTime + 0.05);
            gainNode.gain.linearRampToValueAtTime(0, startTime + duration);

            oscillator.start(startTime);
            oscillator.stop(startTime + duration);
        };

        const now = audioContext.currentTime;
        playTone(880, now, 0.15);        // A5
        playTone(1100, now + 0.15, 0.2); // C#6
    } catch (e) {
        // Audio not available, silently fail
        console.debug('Could not play notification sound:', e);
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

interface StreamState {
    isStreaming: boolean;
    currentText: string;
    sessionKey: string | null;
    claudeSessionId: string | null;
    error: string | null;
    userMessage: Message | null;
    assistantMessageId: number | null;
    toolUses: ToolUse[];
    toolResults: ToolResult[];
    thinking: string;
    costUsd: number | null;
    durationMs: number | null;
    queuedMessage: string | null;
}

interface UseTodoStreamOptions {
    todoId: number;
    onUserMessage?: (message: Message) => void;
    onStreamComplete?: (message: Message) => void;
    onError?: (error: string) => void;
    onToolUse?: (toolUse: ToolUse) => void;
    onToolResult?: (toolResult: ToolResult) => void;
    onThinking?: (thinking: string) => void;
}

interface UseTodoStreamReturn extends StreamState {
    sendMessage: (content: string) => Promise<void>;
    queueMessage: (content: string) => void;
    clearQueue: () => void;
    cancel: () => Promise<void>;
}

export function useTodoStream({
    todoId,
    onUserMessage,
    onStreamComplete,
    onError,
    onToolUse,
    onToolResult,
    onThinking,
}: UseTodoStreamOptions): UseTodoStreamReturn {
    const [state, setState] = useState<StreamState>({
        isStreaming: false,
        currentText: '',
        sessionKey: null,
        claudeSessionId: null,
        error: null,
        userMessage: null,
        assistantMessageId: null,
        toolUses: [],
        toolResults: [],
        thinking: '',
        costUsd: null,
        durationMs: null,
        queuedMessage: null,
    });

    const abortControllerRef = useRef<AbortController | null>(null);

    const sendMessage = useCallback(
        async (content: string) => {
            setState((prev) => ({
                isStreaming: true,
                currentText: '',
                sessionKey: null,
                claudeSessionId: null,
                error: null,
                userMessage: null,
                assistantMessageId: null,
                toolUses: [],
                toolResults: [],
                thinking: '',
                costUsd: null,
                durationMs: null,
                queuedMessage: prev.queuedMessage, // Preserve queued message
            }));

            abortControllerRef.current = new AbortController();

            try {
                const response = await fetch(route('claude.stream', todoId), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'text/event-stream',
                        'X-CSRF-TOKEN':
                            document.querySelector<HTMLMetaElement>(
                                'meta[name="csrf-token"]'
                            )?.content || '',
                    },
                    body: JSON.stringify({ message: content }),
                    signal: abortControllerRef.current.signal,
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
                let currentEvent = ''; // Keep event across chunks

                while (true) {
                    const { done, value } = await reader.read();

                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });

                    // Process complete lines
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || ''; // Keep incomplete line in buffer

                    for (const line of lines) {
                        if (line.startsWith('event: ')) {
                            currentEvent = line.slice(7).trim();
                        } else if (line.startsWith('data: ')) {
                            const currentData = line.slice(6);

                            if (currentEvent && currentData) {
                                try {
                                    const data = JSON.parse(currentData);
                                    handleEvent(currentEvent, data);
                                } catch (e) {
                                    console.error('Failed to parse SSE data:', e, currentData);
                                }
                            }
                            // Reset event after processing (data always follows event)
                            currentEvent = '';
                        } else if (line.trim() === '') {
                            // Empty line marks end of event - reset
                            currentEvent = '';
                        }
                    }
                }

                setState((prev) => ({
                    ...prev,
                    isStreaming: false,
                }));
            } catch (error) {
                if (error instanceof Error && error.name === 'AbortError') {
                    setState((prev) => ({
                        ...prev,
                        isStreaming: false,
                        error: 'Request cancelled',
                    }));
                } else {
                    const errorMessage =
                        error instanceof Error ? error.message : 'Unknown error';
                    setState((prev) => ({
                        ...prev,
                        isStreaming: false,
                        error: errorMessage,
                    }));
                    onError?.(errorMessage);
                }
            }
        },
        [todoId, onError]
    );

    const handleEvent = useCallback(
        (event: string, data: Record<string, unknown>) => {
            switch (event) {
                case 'user_message':
                    setState((prev) => ({
                        ...prev,
                        userMessage: data.message as Message,
                    }));
                    onUserMessage?.(data.message as Message);
                    break;

                case 'session_started':
                    setState((prev) => ({
                        ...prev,
                        sessionKey: data.session_key as string,
                    }));
                    break;

                case 'system':
                    setState((prev) => ({
                        ...prev,
                        claudeSessionId: data.session_id as string | null,
                    }));
                    break;

                case 'assistant_message_created':
                    setState((prev) => ({
                        ...prev,
                        assistantMessageId: data.message_id as number,
                    }));
                    break;

                case 'connected':
                    break;

                case 'text_delta':
                    const deltaText = (data.text as string) || '';
                    const fullContent = (data.full_content as string) || '';
                    setState((prev) => {
                        const newText = fullContent || prev.currentText + deltaText;
                        return {
                            ...prev,
                            currentText: newText,
                        };
                    });
                    break;

                case 'thinking':
                    setState((prev) => ({
                        ...prev,
                        thinking: prev.thinking + ((data.content as string) || ''),
                    }));
                    onThinking?.(data.content as string);
                    break;

                case 'tool_use':
                    const toolUse: ToolUse = {
                        id: data.id as string | null,
                        tool: data.tool as string,
                        input: data.input as Record<string, unknown>,
                    };
                    setState((prev) => ({
                        ...prev,
                        toolUses: [...prev.toolUses, toolUse],
                    }));
                    onToolUse?.(toolUse);
                    break;

                case 'tool_result':
                    const toolResult: ToolResult = {
                        tool_use_id: data.tool_use_id as string | null,
                        content: data.content as string,
                        is_error: data.is_error as boolean,
                    };
                    setState((prev) => ({
                        ...prev,
                        toolResults: [...prev.toolResults, toolResult],
                    }));
                    onToolResult?.(toolResult);
                    break;

                case 'permission_request':
                    console.log('Permission request:', data.tool, data.input);
                    // TODO: Implement permission UI
                    break;

                case 'permission_approved':
                    console.log('Permission auto-approved:', data.tool);
                    break;

                case 'result':
                    setState((prev) => ({
                        ...prev,
                        costUsd: data.cost_usd as number | null,
                        durationMs: data.duration_ms as number | null,
                        claudeSessionId: data.session_id as string | null,
                    }));
                    if (data.is_error) {
                        setState((prev) => ({
                            ...prev,
                            error: data.result as string,
                        }));
                    }
                    break;

                case 'complete':
                    setState((prev) => ({
                        ...prev,
                        isStreaming: false,
                        currentText:
                            (data.message as Message)?.content || prev.currentText,
                    }));
                    playNotificationSound();
                    onStreamComplete?.(data.message as Message);
                    break;

                case 'error':
                    setState((prev) => ({
                        ...prev,
                        isStreaming: false,
                        error: data.message as string,
                    }));
                    onError?.(data.message as string);
                    break;

                case 'debug':
                    console.debug('Claude debug:', data.content);
                    break;

                case 'pre_command_start':
                    console.log('Pre-command starting:', data.command);
                    break;

                case 'pre_command_result':
                    console.log('Pre-command result:', data);
                    break;

                case 'post_command_start':
                    console.log('Post-command starting:', data.command);
                    break;

                case 'post_command_result':
                    console.log('Post-command result:', data);
                    break;
            }
        },
        [onUserMessage, onStreamComplete, onError, onToolUse, onToolResult, onThinking]
    );

    const cancel = useCallback(async () => {
        abortControllerRef.current?.abort();

        if (state.sessionKey) {
            try {
                await fetch(route('claude.cancel', state.sessionKey), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-TOKEN':
                            document.querySelector<HTMLMetaElement>(
                                'meta[name="csrf-token"]'
                            )?.content || '',
                    },
                });
            } catch (e) {
                console.error('Failed to cancel session:', e);
            }
        }

        setState((prev) => ({
            ...prev,
            isStreaming: false,
        }));
    }, [state.sessionKey]);

    // Queue a message to be sent after current streaming completes
    const queueMessage = useCallback((content: string) => {
        setState((prev) => ({
            ...prev,
            queuedMessage: content,
        }));
    }, []);

    // Clear queued message
    const clearQueue = useCallback(() => {
        setState((prev) => ({
            ...prev,
            queuedMessage: null,
        }));
    }, []);

    return {
        ...state,
        sendMessage,
        queueMessage,
        clearQueue,
        cancel,
    };
}
