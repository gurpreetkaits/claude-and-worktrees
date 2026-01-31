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
                <div className="w-48 flex flex-col bg-base-200 border-r border-base-300 shrink-0">
                    {/* Sidebar Header */}
                    <div className="h-10 flex items-center justify-between px-3 text-[11px] font-semibold uppercase tracking-wider text-base-content/60 shrink-0 border-b border-base-300">
                        <span>Terminals</span>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={handleNewTerminal}
                                className="btn btn-ghost btn-xs btn-square hover:bg-base-300"
                                title="New Terminal"
                            >
                                <PlusIcon className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={() => setShowSidebar(false)}
                                className="btn btn-ghost btn-xs btn-square hover:bg-base-300"
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
                                        ? 'bg-base-100 border-l-2 border-primary'
                                        : 'hover:bg-base-100/50 border-l-2 border-transparent'
                                }`}
                                onClick={() => setActiveTerminal(info.id)}
                            >
                                {/* Status indicator */}
                                <div className="shrink-0">
                                    {info.isConnecting ? (
                                        <span className="loading loading-spinner loading-xs text-primary" />
                                    ) : info.isConnected ? (
                                        <span className="w-2 h-2 rounded-full bg-success inline-block" />
                                    ) : info.error ? (
                                        <span className="w-2 h-2 rounded-full bg-error inline-block" />
                                    ) : (
                                        <TerminalIcon className="w-3.5 h-3.5 text-base-content/40" />
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
                                            className="w-full bg-base-100 border border-primary rounded px-1 py-0.5 text-xs focus:outline-none"
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                    ) : (
                                        <span
                                            className="text-xs truncate block"
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
                                            className="btn btn-ghost btn-xs btn-square"
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
                                            className="btn btn-ghost btn-xs btn-square text-error/70 hover:text-error"
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
                <div className="h-10 flex items-center justify-between px-4 text-[11px] font-semibold uppercase tracking-wider text-base-content/60 shrink-0 border-b border-base-300 bg-base-200">
                    <div className="flex items-center gap-2">
                        {!showSidebar && terminalInfos.length > 1 && (
                            <button
                                onClick={() => setShowSidebar(true)}
                                className="btn btn-ghost btn-xs btn-square"
                                title="Show Terminals"
                            >
                                <ChevronRightIcon className="w-3.5 h-3.5" />
                            </button>
                        )}
                        <span>Terminal</span>
                        {activeInfo?.isConnected && (
                            <span className="w-2 h-2 rounded-full bg-success" title="Connected" />
                        )}
                        {activeInfo?.isConnecting && (
                            <span className="loading loading-spinner loading-xs text-primary" />
                        )}
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={handleNewTerminal}
                            className="btn btn-ghost btn-xs btn-square"
                            title="New Terminal"
                        >
                            <PlusIcon className="w-3.5 h-3.5" />
                        </button>
                        <button
                            onClick={handleReconnect}
                            className="btn btn-ghost btn-xs btn-square"
                            title="Reconnect"
                        >
                            <RefreshIcon className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                {/* Error message */}
                {activeInfo?.error && (
                    <div className="px-4 py-3 bg-error/10 border-b border-error/20">
                        <p className="text-xs text-error">{activeInfo.error}</p>
                        <p className="text-xs text-base-content/60 mt-1">
                            Restart with <code className="bg-base-300 px-1 rounded">npm run dev</code> (includes terminal server)
                        </p>
                        <p className="text-xs text-base-content/60 mt-0.5">
                            Or run separately: <code className="bg-base-300 px-1 rounded">npm run terminal</code>
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
