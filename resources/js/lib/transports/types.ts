import { Message } from '@/types';

// Image attachment for sending with messages
export interface MessageImage {
    data: string; // base64 data
    mediaType: string; // e.g., 'image/png'
}

// Event data types that can be received from the stream
export interface StreamEventData {
    // user_message
    message?: Message;
    // session_started
    session_key?: string;
    // text_delta
    text?: string;
    full_content?: string;
    // thinking
    content?: string;
    // tool_use
    id?: string | null;
    tool?: string;
    input?: Record<string, unknown>;
    // tool_result
    tool_use_id?: string | null;
    is_error?: boolean;
    // result
    cost_usd?: number | null;
    duration_ms?: number | null;
    session_id?: string | null;
    result?: string;
    // error
    error?: string;
    // permission_denied
    reason?: string;
    // command events
    command?: string;
    success?: boolean;
    output?: string;
    exit_code?: number;
    // hook_executed
    hook_id?: string | null;
    event?: string;
}

// Callback for stream events
// Using Record<string, unknown> for flexibility with different event types
export type StreamEventCallback = (
    todoId: number,
    event: string,
    data: Record<string, unknown>
) => void;

// Transport connection state
export type TransportState = 'disconnected' | 'connecting' | 'connected' | 'error';

// Transport state change callback
export type TransportStateCallback = (state: TransportState, error?: string) => void;

/**
 * StreamTransport interface - abstraction for different streaming mechanisms.
 * Implementations can use SSE (fetch-based) or WebSocket (Laravel Echo).
 */
export interface StreamTransport {
    /**
     * Get the transport name for debugging.
     */
    readonly name: string;

    /**
     * Get the current connection state.
     */
    readonly state: TransportState;

    /**
     * Send a message to start streaming for a todo.
     * The transport should emit events via the registered callback.
     */
    sendMessage(todoId: number, content: string, images?: MessageImage[]): Promise<void>;

    /**
     * Cancel an active stream for a todo.
     */
    cancel(todoId: number, sessionKey: string | null): Promise<void>;

    /**
     * Connect to receive events for a specific todo.
     * For SSE, this is a no-op (connection happens during sendMessage).
     * For WebSocket, this subscribes to the todo's channel.
     */
    connect(todoId: number): void;

    /**
     * Disconnect from a specific todo's events.
     * For SSE, this aborts the fetch request.
     * For WebSocket, this leaves the channel.
     */
    disconnect(todoId: number): void;

    /**
     * Register a callback to receive stream events.
     * Returns an unsubscribe function.
     */
    onEvent(callback: StreamEventCallback): () => void;

    /**
     * Register a callback for transport state changes.
     * Returns an unsubscribe function.
     */
    onStateChange(callback: TransportStateCallback): () => void;

    /**
     * Check if the transport is available and usable.
     * For WebSocket, this checks if Echo is connected.
     */
    isAvailable(): boolean;

    /**
     * Dispose of all connections and clean up.
     */
    dispose(): void;
}
