import { useState, useCallback, useEffect } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

const TERMINAL_WS_PORT = 6060;

export interface TerminalInfo {
    id: string;
    name: string;
    isConnected: boolean;
    isConnecting: boolean;
    error: string | null;
}

export interface TerminalInstance {
    terminal: Terminal;
    fitAddon: FitAddon;
    ws: WebSocket | null;
    containerRef: HTMLDivElement | null;
    initialized: boolean;
    workingDirectory: string;
    resizeObserver: ResizeObserver | null;
}

interface TerminalSessionState {
    terminalInfos: TerminalInfo[];
    activeTerminalId: string | null;
    showSidebar: boolean;
    terminalIdCounter: number;
}

const initialSessionState: TerminalSessionState = {
    terminalInfos: [],
    activeTerminalId: null,
    showSidebar: false,
    terminalIdCounter: 0,
};

// Listener type
type SessionListener = (todoId: number, state: TerminalSessionState) => void;

// Global terminal session manager - persists terminal state per task
class TerminalSessionManager {
    // State per task
    private sessions: Map<number, TerminalSessionState> = new Map();
    // Terminal instances per task (actual xterm instances)
    private terminals: Map<number, Map<string, TerminalInstance>> = new Map();
    // Listeners per task
    private listeners: Map<number, Set<SessionListener>> = new Map();

    getSession(todoId: number): TerminalSessionState {
        return this.sessions.get(todoId) || { ...initialSessionState };
    }

    getTerminals(todoId: number): Map<string, TerminalInstance> {
        if (!this.terminals.has(todoId)) {
            this.terminals.set(todoId, new Map());
        }
        return this.terminals.get(todoId)!;
    }

    private updateSession(todoId: number, updates: Partial<TerminalSessionState>) {
        const current = this.getSession(todoId);
        const updated = { ...current, ...updates };
        this.sessions.set(todoId, updated);

        // Notify listeners
        const sessionListeners = this.listeners.get(todoId);
        if (sessionListeners) {
            sessionListeners.forEach(listener => listener(todoId, updated));
        }
    }

    subscribe(todoId: number, listener: SessionListener): () => void {
        if (!this.listeners.has(todoId)) {
            this.listeners.set(todoId, new Set());
        }
        this.listeners.get(todoId)!.add(listener);
        return () => {
            this.listeners.get(todoId)?.delete(listener);
        };
    }

    updateTerminalInfo(todoId: number, terminalId: string, updates: Partial<TerminalInfo>) {
        const session = this.getSession(todoId);
        const terminalInfos = session.terminalInfos.map(t =>
            t.id === terminalId ? { ...t, ...updates } : t
        );
        this.updateSession(todoId, { terminalInfos });
    }

    createTerminal(todoId: number, workingDirectory: string): string {
        const session = this.getSession(todoId);
        const newCounter = session.terminalIdCounter + 1;
        const id = `terminal-${todoId}-${newCounter}`;
        const name = `Terminal ${newCounter}`;

        // Create xterm instance
        const term = new Terminal({
            cursorBlink: true,
            fontSize: 13,
            fontFamily: 'Monaco, Menlo, "Ubuntu Mono", Consolas, monospace',
            theme: {
                background: '#1a1a1a',
                foreground: '#e0e0e0',
                cursor: '#e67e22',
                cursorAccent: '#1a1a1a',
                selectionBackground: '#e67e2244',
                black: '#1a1a1a',
                red: '#e74c3c',
                green: '#27ae60',
                yellow: '#f39c12',
                blue: '#3498db',
                magenta: '#9b59b6',
                cyan: '#1abc9c',
                white: '#ecf0f1',
                brightBlack: '#7f8c8d',
                brightRed: '#e74c3c',
                brightGreen: '#2ecc71',
                brightYellow: '#f1c40f',
                brightBlue: '#3498db',
                brightMagenta: '#9b59b6',
                brightCyan: '#1abc9c',
                brightWhite: '#ffffff',
            },
            scrollback: 10000,
            allowProposedApi: true,
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);

        // Store terminal instance
        const terminals = this.getTerminals(todoId);
        terminals.set(id, {
            terminal: term,
            fitAddon,
            ws: null,
            containerRef: null,
            initialized: false,
            workingDirectory,
            resizeObserver: null,
        });

        // Update session state
        const newTerminalInfo: TerminalInfo = {
            id,
            name,
            isConnected: false,
            isConnecting: false,
            error: null,
        };

        this.updateSession(todoId, {
            terminalInfos: [...session.terminalInfos, newTerminalInfo],
            activeTerminalId: id,
            terminalIdCounter: newCounter,
        });

        return id;
    }

    connectTerminal(todoId: number, terminalId: string) {
        const terminals = this.getTerminals(todoId);
        const instance = terminals.get(terminalId);
        if (!instance) return;
        if (instance.ws?.readyState === WebSocket.OPEN) return;

        this.updateTerminalInfo(todoId, terminalId, { isConnecting: true, error: null });

        const cols = instance.terminal.cols || 80;
        const rows = instance.terminal.rows || 24;

        const wsUrl = `ws://localhost:${TERMINAL_WS_PORT}?cwd=${encodeURIComponent(instance.workingDirectory)}&cols=${cols}&rows=${rows}`;
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            instance.ws = ws;
            this.updateTerminalInfo(todoId, terminalId, { isConnected: true, isConnecting: false });
            instance.terminal.focus();
        };

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                switch (msg.type) {
                    case 'output':
                        instance.terminal.write(msg.data);
                        break;
                    case 'connected':
                        console.log(`Terminal ${terminalId} connected, PID:`, msg.pid);
                        break;
                    case 'exit':
                        console.log(`Terminal ${terminalId} exited:`, msg.exitCode);
                        instance.terminal.writeln('\r\n\x1b[90m[Terminal session ended]\x1b[0m');
                        this.updateTerminalInfo(todoId, terminalId, { isConnected: false });
                        break;
                }
            } catch {
                instance.terminal.write(event.data);
            }
        };

        ws.onclose = () => {
            instance.ws = null;
            this.updateTerminalInfo(todoId, terminalId, { isConnected: false, isConnecting: false });
        };

        ws.onerror = () => {
            instance.ws = null;
            this.updateTerminalInfo(todoId, terminalId, {
                error: 'Failed to connect to terminal server. Make sure to run: node terminal-server.js',
                isConnected: false,
                isConnecting: false,
            });
        };

        instance.ws = ws;

        // Handle terminal input
        instance.terminal.onData((data) => {
            if (instance.ws?.readyState === WebSocket.OPEN) {
                instance.ws.send(JSON.stringify({ type: 'input', data }));
            }
        });
    }

    setTerminalContainer(todoId: number, terminalId: string, container: HTMLDivElement | null) {
        const terminals = this.getTerminals(todoId);
        const instance = terminals.get(terminalId);
        if (!instance || !container) return;

        // If terminal was already initialized to a different container, move it
        if (instance.initialized && instance.terminal.element) {
            // Terminal already opened - move its DOM element to the new container
            if (instance.containerRef !== container) {
                // Clean up old resize observer
                instance.resizeObserver?.disconnect();

                // Move the terminal element to the new container
                container.appendChild(instance.terminal.element);
                instance.containerRef = container;

                // Setup new resize observer
                const resizeObserver = new ResizeObserver(() => {
                    if (instance.containerRef) {
                        instance.fitAddon.fit();
                        if (instance.ws?.readyState === WebSocket.OPEN) {
                            instance.ws.send(JSON.stringify({
                                type: 'resize',
                                cols: instance.terminal.cols,
                                rows: instance.terminal.rows,
                            }));
                        }
                    }
                });
                resizeObserver.observe(container);
                instance.resizeObserver = resizeObserver;

                // Fit and focus after moving
                setTimeout(() => {
                    instance.fitAddon.fit();
                    instance.terminal.focus();
                }, 50);
            }
            return;
        }

        // First time initialization
        if (!instance.initialized && container) {
            instance.containerRef = container;
            instance.terminal.open(container);
            instance.initialized = true;

            // Fit and connect after opening
            setTimeout(() => {
                instance.fitAddon.fit();
                this.connectTerminal(todoId, terminalId);
            }, 50);

            // Setup resize observer
            const resizeObserver = new ResizeObserver(() => {
                if (instance.containerRef) {
                    instance.fitAddon.fit();
                    if (instance.ws?.readyState === WebSocket.OPEN) {
                        instance.ws.send(JSON.stringify({
                            type: 'resize',
                            cols: instance.terminal.cols,
                            rows: instance.terminal.rows,
                        }));
                    }
                }
            });
            resizeObserver.observe(container);
            instance.resizeObserver = resizeObserver;
        }
    }

    setActiveTerminal(todoId: number, terminalId: string) {
        this.updateSession(todoId, { activeTerminalId: terminalId });
    }

    setShowSidebar(todoId: number, show: boolean) {
        this.updateSession(todoId, { showSidebar: show });
    }

    closeTerminal(todoId: number, terminalId: string) {
        const terminals = this.getTerminals(todoId);
        const instance = terminals.get(terminalId);

        if (instance) {
            instance.ws?.close();
            instance.resizeObserver?.disconnect();
            instance.terminal.dispose();
            terminals.delete(terminalId);
        }

        const session = this.getSession(todoId);
        const remaining = session.terminalInfos.filter(t => t.id !== terminalId);

        let activeTerminalId = session.activeTerminalId;
        if (terminalId === activeTerminalId && remaining.length > 0) {
            activeTerminalId = remaining[remaining.length - 1].id;
        } else if (remaining.length === 0) {
            activeTerminalId = null;
        }

        this.updateSession(todoId, {
            terminalInfos: remaining,
            activeTerminalId,
        });
    }

    reconnectTerminal(todoId: number, terminalId: string) {
        const terminals = this.getTerminals(todoId);
        const instance = terminals.get(terminalId);
        if (!instance) return;

        instance.ws?.close();
        instance.ws = null;
        instance.terminal.clear();

        this.updateTerminalInfo(todoId, terminalId, {
            isConnected: false,
            isConnecting: false,
            error: null,
        });

        setTimeout(() => {
            this.connectTerminal(todoId, terminalId);
        }, 100);
    }

    renameTerminal(todoId: number, terminalId: string, name: string) {
        this.updateTerminalInfo(todoId, terminalId, { name });
    }

    focusActiveTerminal(todoId: number) {
        const session = this.getSession(todoId);
        if (!session.activeTerminalId) return;

        const terminals = this.getTerminals(todoId);
        const instance = terminals.get(session.activeTerminalId);
        if (instance?.initialized) {
            setTimeout(() => {
                instance.fitAddon.fit();
                instance.terminal.focus();
            }, 50);
        }
    }

}

// Singleton instance
const terminalManager = new TerminalSessionManager();

// Hook for using terminal sessions
export function useTerminalSession(todoId: number, workingDirectory: string) {
    const [session, setSession] = useState<TerminalSessionState>(() =>
        terminalManager.getSession(todoId)
    );

    useEffect(() => {
        // Get initial state
        setSession(terminalManager.getSession(todoId));

        // Subscribe to updates
        return terminalManager.subscribe(todoId, (_, newSession) => {
            setSession(newSession);
        });
    }, [todoId]);

    const createTerminal = useCallback(() => {
        return terminalManager.createTerminal(todoId, workingDirectory);
    }, [todoId, workingDirectory]);

    const setTerminalContainer = useCallback((terminalId: string, container: HTMLDivElement | null) => {
        terminalManager.setTerminalContainer(todoId, terminalId, container);
    }, [todoId]);

    const setActiveTerminal = useCallback((terminalId: string) => {
        terminalManager.setActiveTerminal(todoId, terminalId);
    }, [todoId]);

    const setShowSidebar = useCallback((show: boolean) => {
        terminalManager.setShowSidebar(todoId, show);
    }, [todoId]);

    const closeTerminal = useCallback((terminalId: string) => {
        terminalManager.closeTerminal(todoId, terminalId);
    }, [todoId]);

    const reconnectTerminal = useCallback((terminalId: string) => {
        terminalManager.reconnectTerminal(todoId, terminalId);
    }, [todoId]);

    const renameTerminal = useCallback((terminalId: string, name: string) => {
        terminalManager.renameTerminal(todoId, terminalId, name);
    }, [todoId]);

    const focusActiveTerminal = useCallback(() => {
        terminalManager.focusActiveTerminal(todoId);
    }, [todoId]);

    const getTerminals = useCallback(() => {
        return terminalManager.getTerminals(todoId);
    }, [todoId]);

    return {
        ...session,
        createTerminal,
        setTerminalContainer,
        setActiveTerminal,
        setShowSidebar,
        closeTerminal,
        reconnectTerminal,
        renameTerminal,
        focusActiveTerminal,
        getTerminals,
    };
}
