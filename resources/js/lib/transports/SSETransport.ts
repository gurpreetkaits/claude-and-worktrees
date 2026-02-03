import {
    StreamTransport,
    StreamEventCallback,
    TransportState,
    TransportStateCallback,
    MessageImage,
} from './types';

/**
 * SSE (Server-Sent Events) transport implementation.
 * Uses fetch with streaming response for Claude API events.
 * This is the fallback transport when WebSocket is unavailable.
 */
export class SSETransport implements StreamTransport {
    readonly name = 'SSE';

    private _state: TransportState = 'disconnected';
    private eventCallbacks: Set<StreamEventCallback> = new Set();
    private stateCallbacks: Set<TransportStateCallback> = new Set();
    private abortControllers: Map<number, AbortController> = new Map();

    get state(): TransportState {
        return this._state;
    }

    private setState(state: TransportState, error?: string) {
        this._state = state;
        this.stateCallbacks.forEach((cb) => cb(state, error));
    }

    async sendMessage(todoId: number, content: string, images?: MessageImage[]): Promise<void> {
        // Abort any existing stream for this todo
        const existingController = this.abortControllers.get(todoId);
        if (existingController) {
            existingController.abort();
        }

        const abortController = new AbortController();
        this.abortControllers.set(todoId, abortController);

        this.setState('connecting');

        const streamUrl = route('claude.stream', todoId);

        try {
            const response = await fetch(streamUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'text/event-stream',
                    'X-CSRF-TOKEN':
                        document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')
                            ?.content || '',
                },
                body: JSON.stringify({ message: content, images: images || [] }),
                signal: abortController.signal,
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            this.setState('connected');

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
                                this.emitEvent(todoId, currentEvent, parsed);
                            } catch {
                                // JSON parse error - skip malformed event
                            }
                        }
                        currentEvent = '';
                    }
                }
            }

            this.setState('disconnected');
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                this.setState('disconnected');
            } else {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                this.setState('error', errorMessage);
                this.emitEvent(todoId, 'error', { message: errorMessage });
            }
        } finally {
            this.abortControllers.delete(todoId);
        }
    }

    async cancel(todoId: number, sessionKey: string | null): Promise<void> {
        // Abort the fetch request immediately
        const controller = this.abortControllers.get(todoId);
        if (controller) {
            controller.abort();
            this.abortControllers.delete(todoId);
        }

        // Try to cancel on backend (fire and forget)
        if (sessionKey) {
            fetch(route('claude.cancel', sessionKey), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN':
                        document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')
                            ?.content || '',
                },
            }).catch(() => {});
        }
    }

    connect(_todoId: number): void {
        // No-op for SSE - connection happens during sendMessage
    }

    disconnect(todoId: number): void {
        const controller = this.abortControllers.get(todoId);
        if (controller) {
            controller.abort();
            this.abortControllers.delete(todoId);
        }
    }

    onEvent(callback: StreamEventCallback): () => void {
        this.eventCallbacks.add(callback);
        console.log(`[SSETransport] Event callback registered. Total: ${this.eventCallbacks.size}`);
        return () => {
            this.eventCallbacks.delete(callback);
            console.log(`[SSETransport] Event callback unregistered. Total: ${this.eventCallbacks.size}`);
        };
    }

    onStateChange(callback: TransportStateCallback): () => void {
        this.stateCallbacks.add(callback);
        return () => this.stateCallbacks.delete(callback);
    }

    isAvailable(): boolean {
        // SSE is always available as fallback
        return true;
    }

    dispose(): void {
        // Abort all active streams
        this.abortControllers.forEach((controller) => controller.abort());
        this.abortControllers.clear();
        this.eventCallbacks.clear();
        this.stateCallbacks.clear();
        this.setState('disconnected');
    }

    private emitEvent(todoId: number, event: string, data: Record<string, unknown>) {
        console.log(`[SSETransport] Emitting event: ${event}`, { todoId, callbackCount: this.eventCallbacks.size });
        this.eventCallbacks.forEach((cb) => cb(todoId, event, data));
    }
}
