import {
    StreamTransport,
    StreamEventCallback,
    TransportState,
    TransportStateCallback,
    MessageImage,
} from './types';

// All event types that Claude can emit
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
];

/**
 * WebSocket transport implementation using Laravel Echo/Reverb.
 * Provides real-time streaming via a persistent WebSocket connection.
 * This is the preferred transport for parallel streams.
 */
export class WebSocketTransport implements StreamTransport {
    readonly name = 'WebSocket';

    private _state: TransportState = 'disconnected';
    private eventCallbacks: Set<StreamEventCallback> = new Set();
    private stateCallbacks: Set<TransportStateCallback> = new Set();
    private subscribedChannels: Map<number, ReturnType<typeof window.Echo.channel>> = new Map();
    private connectionCheckInterval: ReturnType<typeof setInterval> | null = null;

    constructor() {
        this.setupConnectionMonitoring();
    }

    get state(): TransportState {
        return this._state;
    }

    private setState(state: TransportState, error?: string) {
        if (this._state !== state) {
            this._state = state;
            this.stateCallbacks.forEach((cb) => cb(state, error));
        }
    }

    private setupConnectionMonitoring() {
        // Monitor Echo connection state
        if (window.Echo?.connector?.pusher?.connection) {
            const connection = window.Echo.connector.pusher.connection;

            connection.bind('connected', () => {
                console.log('[WebSocketTransport] Connected to Reverb');
                this.setState('connected');
            });

            connection.bind('connecting', () => {
                console.log('[WebSocketTransport] Connecting to Reverb...');
                this.setState('connecting');
            });

            connection.bind('disconnected', () => {
                console.warn('[WebSocketTransport] Disconnected from Reverb');
                this.setState('disconnected');
            });

            connection.bind('error', (error: unknown) => {
                console.error('[WebSocketTransport] Connection error:', error);
                this.setState('error', String(error));
            });

            // Check initial state
            if (connection.state === 'connected') {
                this.setState('connected');
            }
        }

        // Periodic connection check
        this.connectionCheckInterval = setInterval(() => {
            this.updateStateFromEcho();
        }, 5000);
    }

    private updateStateFromEcho() {
        if (!window.Echo?.connector?.pusher?.connection) {
            if (this._state !== 'disconnected') {
                this.setState('disconnected');
            }
            return;
        }

        const connectionState = window.Echo.connector.pusher.connection.state;
        switch (connectionState) {
            case 'connected':
                if (this._state !== 'connected') {
                    this.setState('connected');
                }
                break;
            case 'connecting':
            case 'initialized':
                if (this._state !== 'connecting') {
                    this.setState('connecting');
                }
                break;
            default:
                if (this._state !== 'disconnected') {
                    this.setState('disconnected');
                }
        }
    }

    async sendMessage(todoId: number, content: string, images?: MessageImage[]): Promise<void> {
        // Ensure we're subscribed to the channel first
        this.connect(todoId);

        // POST to WebSocket endpoint to trigger the background job
        const streamUrl = route('claude.stream.ws', todoId);

        try {
            const response = await fetch(streamUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'X-CSRF-TOKEN':
                        document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')
                            ?.content || '',
                },
                body: JSON.stringify({ message: content, images: images || [] }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
            }

            // Job is now dispatched, events will come via WebSocket
            console.log('[WebSocketTransport] Message sent, awaiting WebSocket events');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.emitEvent(todoId, 'error', { message: errorMessage });
            throw error;
        }
    }

    async cancel(todoId: number, sessionKey: string | null): Promise<void> {
        // Try to cancel on backend
        if (sessionKey) {
            try {
                await fetch(route('claude.cancel', sessionKey), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-TOKEN':
                            document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')
                                ?.content || '',
                    },
                });
            } catch (e) {
                console.error('[WebSocketTransport] Failed to cancel session:', e);
            }
        }
    }

    connect(todoId: number): void {
        if (this.subscribedChannels.has(todoId)) {
            console.log(`[WebSocketTransport] Already subscribed to todo ${todoId}`);
            return;
        }

        if (!window.Echo) {
            console.error('[WebSocketTransport] Echo not available');
            return;
        }

        const channelName = `claude.todo.${todoId}`;
        console.log(`[WebSocketTransport] Subscribing to channel: ${channelName}`);

        const channel = window.Echo.channel(channelName);

        // Listen to all Claude events
        CLAUDE_EVENTS.forEach((event) => {
            channel.listen(`.${event}`, (data: Record<string, unknown>) => {
                console.log(`[WebSocketTransport] Received ${event}:`, data);
                this.emitEvent(todoId, event, data);
            });
        });

        this.subscribedChannels.set(todoId, channel);
        console.log(`[WebSocketTransport] Subscribed to ${channelName}`);
    }

    disconnect(todoId: number): void {
        const channel = this.subscribedChannels.get(todoId);
        if (channel && window.Echo) {
            window.Echo.leave(`claude.todo.${todoId}`);
            this.subscribedChannels.delete(todoId);
            console.log(`[WebSocketTransport] Left channel for todo ${todoId}`);
        }
    }

    onEvent(callback: StreamEventCallback): () => void {
        this.eventCallbacks.add(callback);
        return () => this.eventCallbacks.delete(callback);
    }

    onStateChange(callback: TransportStateCallback): () => void {
        this.stateCallbacks.add(callback);
        // Immediately call with current state
        callback(this._state);
        return () => this.stateCallbacks.delete(callback);
    }

    isAvailable(): boolean {
        // Check if Echo is initialized and connected
        if (!window.Echo?.connector?.pusher?.connection) {
            return false;
        }
        return window.Echo.connector.pusher.connection.state === 'connected';
    }

    dispose(): void {
        // Clear connection monitoring
        if (this.connectionCheckInterval) {
            clearInterval(this.connectionCheckInterval);
            this.connectionCheckInterval = null;
        }

        // Leave all channels
        this.subscribedChannels.forEach((_, todoId) => {
            if (window.Echo) {
                window.Echo.leave(`claude.todo.${todoId}`);
            }
        });
        this.subscribedChannels.clear();
        this.eventCallbacks.clear();
        this.stateCallbacks.clear();
        this.setState('disconnected');
    }

    private emitEvent(todoId: number, event: string, data: Record<string, unknown>) {
        this.eventCallbacks.forEach((cb) => cb(todoId, event, data));
    }
}
