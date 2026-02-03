import { useEffect, useRef, useState, useCallback } from 'react';
import '@xterm/xterm/css/xterm.css';
import { RefreshIcon, PlusIcon, XIcon, EditIcon, TerminalIcon, ChevronRightIcon } from './ui/Icons';
import { useTerminalSession } from '@/hooks/useTerminalSessions';

interface TerminalPanelProps {
    todoId: number;
    workingDirectory: string;
}

export function TerminalPanel({ todoId, workingDirectory }: TerminalPanelProps) {
    const {
        terminalInfos,
        activeTerminalId,
        showSidebar,
        createTerminal,
        setTerminalContainer,
        setActiveTerminal,
        setShowSidebar,
        closeTerminal,
        reconnectTerminal,
        renameTerminal,
        focusActiveTerminal,
        getTerminals,
    } = useTerminalSession(todoId, workingDirectory);

    const [editingNameId, setEditingNameId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');
    const nameInputRef = useRef<HTMLInputElement>(null);

    // Initialize first terminal on mount if none exist
    useEffect(() => {
        if (terminalInfos.length === 0) {
            createTerminal();
        }
    }, [terminalInfos.length, createTerminal]);

    // Focus active terminal when switching
    useEffect(() => {
        if (activeTerminalId) {
            focusActiveTerminal();
        }
    }, [activeTerminalId, focusActiveTerminal]);

    // Handle reconnect
    const handleReconnect = useCallback(() => {
        if (activeTerminalId) {
            reconnectTerminal(activeTerminalId);
        }
    }, [activeTerminalId, reconnectTerminal]);

    // Handle close terminal
    const handleCloseTerminal = useCallback((id: string) => {
        closeTerminal(id);
    }, [closeTerminal]);

    // Handle new terminal
    const handleNewTerminal = useCallback(() => {
        createTerminal();
        // Show sidebar when creating additional terminals
        if (terminalInfos.length >= 1) {
            setShowSidebar(true);
        }
    }, [createTerminal, terminalInfos.length, setShowSidebar]);

    // Handle rename
    const startEditing = (id: string, currentName: string) => {
        setEditingNameId(id);
        setEditingName(currentName);
        setTimeout(() => nameInputRef.current?.select(), 50);
    };

    const saveEdit = () => {
        if (editingNameId && editingName.trim()) {
            renameTerminal(editingNameId, editingName.trim());
        }
        setEditingNameId(null);
        setEditingName('');
    };

    // Focus terminal on click
    const focusTerminal = useCallback(() => {
        focusActiveTerminal();
    }, [focusActiveTerminal]);

    const activeInfo = terminalInfos.find(t => t.id === activeTerminalId);

    return (
        <div className="h-full flex bg-[#1a1a1a]">
            {/* Terminal Sidebar - collapsible */}
            {showSidebar && (
                <div className="w-48 flex flex-col bg-gray-800 border-r border-gray-700 shrink-0">
                    {/* Sidebar Header */}
                    <div className="h-10 flex items-center justify-between px-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400 shrink-0 border-b border-gray-700">
                        <span>Terminals</span>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={handleNewTerminal}
                                className="p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors"
                                title="New Terminal"
                            >
                                <PlusIcon className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={() => setShowSidebar(false)}
                                className="p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors"
                                title="Hide Sidebar"
                            >
                                <XIcon className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>

                    {/* Terminal List */}
                    <div className="flex-1 overflow-y-auto">
                        {terminalInfos.map((info) => (
                            <div
                                key={info.id}
                                className={`group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
                                    info.id === activeTerminalId
                                        ? 'bg-gray-700 border-l-2 border-gray-400'
                                        : 'hover:bg-gray-700/50 border-l-2 border-transparent'
                                }`}
                                onClick={() => setActiveTerminal(info.id)}
                            >
                                {/* Status indicator */}
                                <div className="shrink-0">
                                    {info.isConnecting ? (
                                        <span className="w-3 h-3 border-2 border-gray-500 border-t-gray-300 rounded-full animate-spin inline-block" />
                                    ) : info.isConnected ? (
                                        <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                                    ) : info.error ? (
                                        <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                                    ) : (
                                        <TerminalIcon className="w-3.5 h-3.5 text-gray-500" />
                                    )}
                                </div>

                                {/* Name (editable) */}
                                <div className="flex-1 min-w-0">
                                    {editingNameId === info.id ? (
                                        <input
                                            ref={nameInputRef}
                                            type="text"
                                            value={editingName}
                                            onChange={(e) => setEditingName(e.target.value)}
                                            onBlur={saveEdit}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') saveEdit();
                                                if (e.key === 'Escape') {
                                                    setEditingNameId(null);
                                                    setEditingName('');
                                                }
                                            }}
                                            className="w-full bg-gray-700 border border-gray-500 rounded px-1 py-0.5 text-xs text-gray-200 focus:outline-none focus:border-gray-400"
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                    ) : (
                                        <span
                                            className="text-xs truncate block text-gray-300"
                                            onDoubleClick={(e) => {
                                                e.stopPropagation();
                                                startEditing(info.id, info.name);
                                            }}
                                            title="Double-click to rename"
                                        >
                                            {info.name}
                                        </span>
                                    )}
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 shrink-0">
                                    {editingNameId !== info.id && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                startEditing(info.id, info.name);
                                            }}
                                            className="p-1 text-gray-400 hover:text-gray-200 rounded transition-colors"
                                            title="Rename"
                                        >
                                            <EditIcon className="w-3 h-3" />
                                        </button>
                                    )}
                                    {terminalInfos.length > 1 && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleCloseTerminal(info.id);
                                            }}
                                            className="p-1 text-red-400 hover:text-red-300 rounded transition-colors"
                                            title="Close Terminal"
                                        >
                                            <XIcon className="w-3 h-3" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Terminal Content */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Header */}
                <div className="h-10 flex items-center justify-between px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400 shrink-0 border-b border-gray-700 bg-gray-800">
                    <div className="flex items-center gap-2">
                        {!showSidebar && terminalInfos.length > 1 && (
                            <button
                                onClick={() => setShowSidebar(true)}
                                className="p-1 text-gray-400 hover:text-gray-200 rounded transition-colors"
                                title="Show Terminals"
                            >
                                <ChevronRightIcon className="w-3.5 h-3.5" />
                            </button>
                        )}
                        <span>Terminal</span>
                        {activeInfo?.isConnected && (
                            <span className="w-2 h-2 rounded-full bg-green-500" title="Connected" />
                        )}
                        {activeInfo?.isConnecting && (
                            <span className="w-3 h-3 border-2 border-gray-500 border-t-gray-300 rounded-full animate-spin inline-block" />
                        )}
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={handleNewTerminal}
                            className="p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors"
                            title="New Terminal"
                        >
                            <PlusIcon className="w-3.5 h-3.5" />
                        </button>
                        <button
                            onClick={handleReconnect}
                            className="p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors"
                            title="Reconnect"
                        >
                            <RefreshIcon className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                {/* Error message */}
                {activeInfo?.error && (
                    <div className="px-4 py-3 bg-red-900/20 border-b border-red-800/30">
                        <p className="text-xs text-red-400">{activeInfo.error}</p>
                        <p className="text-xs text-gray-400 mt-1">
                            Restart with <code className="bg-gray-700 px-1 rounded">npm run dev</code> (includes terminal server)
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                            Or run separately: <code className="bg-gray-700 px-1 rounded">npm run terminal</code>
                        </p>
                    </div>
                )}

                {/* Terminal containers - each terminal gets its own persistent container */}
                <div className="flex-1 relative overflow-hidden" onClick={focusTerminal}>
                    {terminalInfos.map((info) => (
                        <div
                            key={info.id}
                            ref={(el) => {
                                if (el) setTerminalContainer(info.id, el);
                            }}
                            className={`absolute inset-0 p-2 ${
                                info.id === activeTerminalId ? 'visible' : 'invisible'
                            }`}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}
