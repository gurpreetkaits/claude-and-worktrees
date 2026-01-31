#!/usr/bin/env node

/**
 * Terminal WebSocket Server
 *
 * Provides a real PTY-based terminal via WebSocket connections.
 * Uses node-pty for full terminal emulation.
 */

import { WebSocketServer } from 'ws';
import pty from 'node-pty';
import { platform, homedir } from 'os';
import { existsSync } from 'fs';

const PORT = process.env.TERMINAL_PORT || 6060;

function getShell() {
    if (platform() === 'win32') {
        return 'powershell.exe';
    }

    const shells = [
        process.env.SHELL,
        '/bin/zsh',
        '/bin/bash',
        '/bin/sh'
    ].filter(Boolean);

    for (const shell of shells) {
        if (existsSync(shell)) {
            return shell;
        }
    }

    return '/bin/sh';
}

const shell = getShell();
console.log(`Using shell: ${shell}`);

const wss = new WebSocketServer({ port: PORT });
console.log(`Terminal server running on ws://localhost:${PORT}`);

const terminals = new Map();

wss.on('connection', (ws, req) => {
    let cwd = homedir();

    try {
        const url = new URL(req.url, `http://localhost:${PORT}`);
        const requestedCwd = url.searchParams.get('cwd');
        const cols = parseInt(url.searchParams.get('cols')) || 80;
        const rows = parseInt(url.searchParams.get('rows')) || 24;

        if (requestedCwd && existsSync(requestedCwd)) {
            cwd = requestedCwd;
        } else if (requestedCwd) {
            console.warn(`Directory not found: ${requestedCwd}, using home directory`);
        }

        console.log(`New terminal connection, cwd: ${cwd}, size: ${cols}x${rows}`);

        let ptyProcess;

        try {
            ptyProcess = pty.spawn(shell, [], {
                name: 'xterm-256color',
                cols: cols,
                rows: rows,
                cwd: cwd,
                env: {
                    ...process.env,
                    TERM: 'xterm-256color',
                    COLORTERM: 'truecolor',
                    HOME: homedir(),
                    SHELL: shell,
                    LANG: process.env.LANG || 'en_US.UTF-8',
                },
            });
        } catch (e) {
            console.error('Failed to spawn PTY:', e.message);
            ws.send(JSON.stringify({
                type: 'error',
                message: `Failed to start terminal: ${e.message}`
            }));
            ws.close();
            return;
        }

        const terminalId = ptyProcess.pid;
        terminals.set(terminalId, { pty: ptyProcess, ws });

        console.log(`Terminal started with PID: ${terminalId}`);

        // Send PTY output to WebSocket
        ptyProcess.onData((data) => {
            try {
                if (ws.readyState === ws.OPEN) {
                    ws.send(JSON.stringify({ type: 'output', data }));
                }
            } catch (e) {
                console.error('Error sending data:', e);
            }
        });

        // Handle PTY exit
        ptyProcess.onExit(({ exitCode, signal }) => {
            console.log(`Terminal ${terminalId} exited with code ${exitCode}, signal ${signal}`);
            terminals.delete(terminalId);
            if (ws.readyState === ws.OPEN) {
                ws.send(JSON.stringify({ type: 'exit', exitCode, signal }));
                ws.close();
            }
        });

        // Handle incoming messages from WebSocket
        ws.on('message', (message) => {
            try {
                const msg = JSON.parse(message.toString());

                switch (msg.type) {
                    case 'input':
                        ptyProcess.write(msg.data);
                        break;

                    case 'resize':
                        if (msg.cols > 0 && msg.rows > 0) {
                            ptyProcess.resize(
                                Math.min(Math.max(msg.cols, 10), 500),
                                Math.min(Math.max(msg.rows, 5), 200)
                            );
                        }
                        break;

                    case 'ping':
                        ws.send(JSON.stringify({ type: 'pong' }));
                        break;
                }
            } catch (e) {
                console.error('Error processing message:', e);
            }
        });

        // Handle WebSocket close
        ws.on('close', () => {
            console.log(`Terminal ${terminalId} connection closed`);
            try {
                ptyProcess.kill();
            } catch (e) {}
            terminals.delete(terminalId);
        });

        // Handle WebSocket error
        ws.on('error', (error) => {
            console.error(`Terminal ${terminalId} error:`, error);
            try {
                ptyProcess.kill();
            } catch (e) {}
            terminals.delete(terminalId);
        });

        // Send initial connection success
        ws.send(JSON.stringify({ type: 'connected', pid: terminalId, cwd }));

    } catch (e) {
        console.error('Connection error:', e);
        ws.close();
    }
});

// Graceful shutdown
const shutdown = () => {
    console.log('\nShutting down terminal server...');
    terminals.forEach(({ pty }) => {
        try {
            pty.kill();
        } catch (e) {}
    });
    wss.close();
    process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
