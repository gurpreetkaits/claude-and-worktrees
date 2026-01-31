import { useState, useCallback, useRef, useEffect } from 'react';
import { Message } from '@/types';

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
    thinking: string;
    costUsd: number | null;
    durationMs: number | null;
}

interface UseWebSocketStreamOptions {
    todoId: number;
    onUserMessage?: (message: Message) => void;
    onStreamComplete?: (message: Message) => void;
    onError?: (error: string) => void;
    onToolUse?: (toolUse: ToolUse) => void;
    onToolResult?: (toolResult: ToolResult) => void;
    onThinking?: (thinking: string) => void;
}

interface UseWebSocketStreamReturn extends StreamState {
    sendMessage: (content: string) => Promise<void>;
    cancel: () => Promise<void>;
}

export function useWebSocketStream({
    todoId,
    onUserMessage,
    onStreamComplete,
    onError,
    onToolUse,
    onToolResult,
    onThinking,
}: UseWebSocketStreamOptions): UseWebSocketStreamReturn {
    const [state, setState] = useState<StreamState>({
        isStreaming: false,
        currentText: '',
        sessionKey: null,
        claudeSessionId: null,
        error: null,
        userMessage: null,
        assistantMessageId: null,
        toolUses: [],
        thinking: '',
        costUsd: null,
        durationMs: null,
    });

    const channelRef = useRef<ReturnType<typeof window.Echo.channel> | null>(null);
    const isSubscribedRef = useRef(false);

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

                case 'text_delta':
                    setState((prev) => ({
                        ...prev,
                        currentText:
                            (data.full_content as string) ||
                            prev.currentText + ((data.text as string) || ''),
                    }));
                    break;

                case 'thinking':
                    setState((prev) => ({
                        ...prev,
                        thinking: prev.thinking + ((data.content as string) || ''),
                    }));
                    onThinking?.(data.content as string);
                    break;

                case 'tool_use': {
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
                }

                case 'tool_result': {
                    const toolResult: ToolResult = {
                        tool_use_id: data.tool_use_id as string | null,
                        content: data.content as string,
                        is_error: data.is_error as boolean,
                    };
                    onToolResult?.(toolResult);
                    break;
                }

                case 'permission_request':
                    console.log('Permission request:', data.tool, data.input);
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

    // Subscribe to the WebSocket channel
    const subscribeToChannel = useCallback(() => {
        if (isSubscribedRef.current) {
            console.log('[WebSocket] Already subscribed to channel');
            return;
        }

        if (!window.Echo) {
            console.error('[WebSocket] Echo not available');
            return;
        }

        const channelName = `claude.todo.${todoId}`;
        console.log('[WebSocket] Subscribing to channel:', channelName);

        channelRef.current = window.Echo.channel(channelName);

        // Listen to all event types
        const events = [
            'user_message',
            'session_started',
            'system',
            'assistant_message_created',
            'text_delta',
            'thinking',
            'tool_use',
            'tool_result',
            'permission_request',
            'permission_approved',
            'result',
            'complete',
            'error',
            'debug',
            'pre_command_start',
            'pre_command_result',
            'post_command_start',
            'post_command_result',
        ];

        events.forEach((event) => {
            channelRef.current?.listen(`.${event}`, (data: Record<string, unknown>) => {
                console.log(`[WebSocket] Received event: ${event}`, data);
                handleEvent(event, data);
            });
        });

        isSubscribedRef.current = true;
        console.log('[WebSocket] Subscribed to all events');
    }, [todoId, handleEvent]);

    // Unsubscribe from the channel
    const unsubscribeFromChannel = useCallback(() => {
        if (channelRef.current && window.Echo) {
            window.Echo.leave(`claude.todo.${todoId}`);
            channelRef.current = null;
            isSubscribedRef.current = false;
        }
    }, [todoId]);

    // Subscribe when component mounts, unsubscribe on unmount
    useEffect(() => {
        subscribeToChannel();
        return () => {
            unsubscribeFromChannel();
        };
    }, [subscribeToChannel, unsubscribeFromChannel]);

    const sendMessage = useCallback(
        async (content: string) => {
            console.log('[WebSocket] Sending message:', content.substring(0, 100));

            // Reset state
            setState({
                isStreaming: true,
                currentText: '',
                sessionKey: null,
                claudeSessionId: null,
                error: null,
                userMessage: null,
                assistantMessageId: null,
                toolUses: [],
                thinking: '',
                costUsd: null,
                durationMs: null,
            });

            // Ensure we're subscribed to the channel
            subscribeToChannel();

            try {
                // Trigger the background job via HTTP POST
                const response = await fetch(route('claude.stream.ws', todoId), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'X-CSRF-TOKEN':
                            document.querySelector<HTMLMetaElement>(
                                'meta[name="csrf-token"]'
                            )?.content || '',
                    },
                    body: JSON.stringify({ message: content }),
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(
                        errorData.message || `HTTP error! status: ${response.status}`
                    );
                }

                // The job is now dispatched, events will come via WebSocket
            } catch (error) {
                const errorMessage =
                    error instanceof Error ? error.message : 'Unknown error';
                setState((prev) => ({
                    ...prev,
                    isStreaming: false,
                    error: errorMessage,
                }));
                onError?.(errorMessage);
            }
        },
        [todoId, onError, subscribeToChannel]
    );

    const cancel = useCallback(async () => {
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

    return {
        ...state,
        sendMessage,
        cancel,
    };
}
