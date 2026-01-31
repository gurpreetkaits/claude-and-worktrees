import axios from 'axios';
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

window.axios = axios;
window.axios.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';

// Configure Pusher for Laravel Echo (Reverb uses Pusher protocol)
window.Pusher = Pusher;

// Initialize Laravel Echo with Reverb WebSocket
const echoConfig = {
    broadcaster: 'reverb' as const,
    key: import.meta.env.VITE_REVERB_APP_KEY,
    wsHost: import.meta.env.VITE_REVERB_HOST,
    wsPort: import.meta.env.VITE_REVERB_PORT ?? 80,
    wssPort: import.meta.env.VITE_REVERB_PORT ?? 443,
    forceTLS: (import.meta.env.VITE_REVERB_SCHEME ?? 'https') === 'https',
    enabledTransports: ['ws', 'wss'] as ('ws' | 'wss')[],
};

console.log('[Echo] Initializing with config:', echoConfig);

window.Echo = new Echo(echoConfig);

// Log connection state
window.Echo.connector.pusher.connection.bind('connected', () => {
    console.log('[Echo] Connected to Reverb WebSocket');
});

window.Echo.connector.pusher.connection.bind('error', (error: unknown) => {
    console.error('[Echo] Connection error:', error);
});

window.Echo.connector.pusher.connection.bind('disconnected', () => {
    console.warn('[Echo] Disconnected from Reverb WebSocket');
});

// Export Echo for use in components
export { };
