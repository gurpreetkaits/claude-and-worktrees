import { useRef, useEffect, FormEvent, useState, useCallback } from 'react';
import { Todo, Message } from '@/types';
import { SendIcon, XIcon, FolderIcon, GitBranchIcon, PlayIcon, StopIcon, RerunIcon } from './ui/Icons';
import { useTodoSession } from '@/hooks/useConcurrentSessions';
import { StreamingMessage } from './StreamingMessage';
import { Markdown } from './ui/Markdown';

interface TodoChatProps {
    todo: Todo;
    messages: Message[];
    onNewMessage: (message: Message) => void;
}

export function TodoChat({ todo, messages, onNewMessage }: TodoChatProps) {
    // Input state synced with per-task draft storage
    const [input, setInputLocal] = useState('');
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [userScrolled, setUserScrolled] = useState(false);

    const {
        isStreaming,
        currentText,
        error,
        toolUses,
        toolResults,
        thinking,
        costUsd,
        durationMs,
        queuedMessages,
        lastUserMessage,
        lastCompletedMessage,
        completionCount,
        blockedCommands,
        sendMessage,
        queueMessage,
        clearQueue,
        clearQueueItem,
        cancel,
        setDraftInput,
        getDraftInput,
    } = useTodoSession(todo.id);

    // Wrapper to sync input with per-task draft storage
    const setInput = useCallback((value: string) => {
        setInputLocal(value);
        setDraftInput(value);
    }, [setDraftInput]);

    // Load draft input when switching tasks
    useEffect(() => {
        setInputLocal(getDraftInput());
    }, [todo.id, getDraftInput]);

    // Reset refs when todo changes
    const lastProcessedUserMessageId = useRef<number | null>(null);
    const lastProcessedCompletionCount = useRef(0);
    const currentTodoId = useRef(todo.id);

    // Reset tracking when switching todos
    useEffect(() => {
        if (currentTodoId.current !== todo.id) {
            currentTodoId.current = todo.id;
            lastProcessedUserMessageId.current = null;
            lastProcessedCompletionCount.current = 0;
        }
    }, [todo.id]);

    // Handle user message via effect (use ref for callback to avoid dependency)
    const onNewMessageRef = useRef(onNewMessage);
    onNewMessageRef.current = onNewMessage;

    useEffect(() => {
        if (lastUserMessage && lastUserMessage.id !== lastProcessedUserMessageId.current) {
            lastProcessedUserMessageId.current = lastUserMessage.id;
            onNewMessageRef.current(lastUserMessage);
        }
    }, [lastUserMessage]);

    // Handle completion via effect
    useEffect(() => {
        if (completionCount > lastProcessedCompletionCount.current && lastCompletedMessage) {
            lastProcessedCompletionCount.current = completionCount;
            onNewMessageRef.current(lastCompletedMessage);
        }
    }, [completionCount, lastCompletedMessage]);

    // Get the last user message for rerun (from messages prop)
    const lastUserMessageFromHistory = [...messages].reverse().find(m => m.role === 'user');

    // Start task with context
    const handleStart = useCallback(() => {
        if (todo.context && !isStreaming) {
            setUserScrolled(false);
            sendMessage(todo.context);
        }
    }, [todo.context, isStreaming, sendMessage]);

    // Rerun the last user message
    const handleRerun = useCallback(async (content: string) => {
        setUserScrolled(false);
        if (isStreaming) {
            await cancel();
            setTimeout(() => sendMessage(content), 100);
        } else {
            sendMessage(content);
        }
    }, [isStreaming, cancel, sendMessage]);

    // Stop the current stream
    const handleStop = useCallback(() => {
        cancel();
    }, [cancel]);

    // Track if user manually scrolled up
    const handleScroll = useCallback(() => {
        if (!messagesContainerRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
        setUserScrolled(!isAtBottom);
    }, []);

    // Auto-scroll to bottom
    const scrollToBottom = useCallback((instant = false) => {
        if (userScrolled) return;
        messagesEndRef.current?.scrollIntoView({
            behavior: instant ? 'instant' : 'smooth',
            block: 'end'
        });
    }, [userScrolled]);

    // Reset scroll tracking on task switch (no auto-scroll, show as-is)
    const prevTodoId = useRef(todo.id);
    const prevMessagesLength = useRef(messages.length);
    useEffect(() => {
        if (prevTodoId.current !== todo.id) {
            prevTodoId.current = todo.id;
            prevMessagesLength.current = messages.length;
            setUserScrolled(false);
            // No scroll on task switch - show content as-is
        }
    }, [todo.id, messages.length]);

    // Scroll when NEW messages arrive (not on task switch)
    useEffect(() => {
        // Only scroll if messages increased (new message) not on task switch
        if (messages.length > prevMessagesLength.current) {
            scrollToBottom(false);
        }
        prevMessagesLength.current = messages.length;
    }, [messages.length, scrollToBottom]);

    // Scroll during streaming (throttled)
    const lastScrollTime = useRef(0);
    useEffect(() => {
        if (!isStreaming || userScrolled) return;
        const now = Date.now();
        if (now - lastScrollTime.current > 100) {
            lastScrollTime.current = now;
            scrollToBottom(false);
        }
    }, [currentText, isStreaming, userScrolled, scrollToBottom]);

    const handleSubmit = useCallback(async (e: FormEvent) => {
        e.preventDefault();
        if (!input.trim()) return;

        const userMessage = input.trim();
        setInput('');
        setUserScrolled(false);

        if (isStreaming) {
            queueMessage(userMessage);
        } else {
            sendMessage(userMessage);
        }
    }, [input, isStreaming, queueMessage, sendMessage, setInput]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    }, [handleSubmit]);

    // Determine what the main action button should do
    const hasInput = input.trim().length > 0;
    const canStart = messages.length === 0 && todo.context && !isStreaming;

    return (
        <div className="h-full flex flex-col bg-bg-primary relative">
            {/* Header - sticky */}
            <div className="flex-shrink-0 bg-bg-primary border-b border-border px-4 py-3 z-10">
                <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                        <h2 className="font-medium truncate text-text-high">{todo.title}</h2>
                        {todo.worktree && (
                            <div className="flex items-center gap-3 mt-1 text-xs text-text-low">
                                <span className="flex items-center gap-1 truncate" title={todo.worktree.path}>
                                    <FolderIcon className="w-3 h-3 flex-shrink-0" />
                                    <span className="truncate">{todo.worktree.path}</span>
                                </span>
                                {todo.worktree.branch && (
                                    <span className="flex items-center gap-1 flex-shrink-0">
                                        <GitBranchIcon className="w-3 h-3" />
                                        <span>{todo.worktree.branch}</span>
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                        {/* Stats */}
                        {costUsd !== null && (
                            <span className="text-xs text-text-low">
                                ${costUsd.toFixed(4)}
                            </span>
                        )}
                        {durationMs !== null && (
                            <span className="text-xs text-text-low">
                                {(durationMs / 1000).toFixed(1)}s
                            </span>
                        )}

                        {/* Stop button in header when streaming */}
                        {isStreaming && (
                            <button
                                onClick={handleStop}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-error text-white rounded-lg hover:bg-error/90 transition-colors text-sm font-medium"
                                title="Stop streaming"
                            >
                                <StopIcon className="w-3.5 h-3.5" />
                                Stop
                            </button>
                        )}

                        {/* Rerun button */}
                        {lastUserMessageFromHistory && !isStreaming && (
                            <button
                                onClick={() => handleRerun(lastUserMessageFromHistory.content)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-panel text-text-normal rounded-lg hover:bg-bg-secondary hover:text-text-high transition-colors text-sm"
                                title="Rerun last message"
                            >
                                <RerunIcon className="w-3.5 h-3.5" />
                                Rerun
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Messages area - scrollable */}
            <div
                ref={messagesContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide"
            >
                {messages.length === 0 && !isStreaming ? (
                    <div className="h-full flex items-center justify-center text-text-low">
                        <div className="text-center">
                            {todo.context ? (
                                <p>Press Start to begin</p>
                            ) : (
                                <>
                                    <p>No context provided</p>
                                    <p className="text-xs mt-1 opacity-70">Add context to this task to get started</p>
                                </>
                            )}
                        </div>
                    </div>
                ) : (
                    <>
                        {messages.map((message) => (
                            <div
                                key={message.id}
                                className={`group ${message.role === 'user' ? 'text-right' : ''}`}
                            >
                                <div
                                    className={`text-sm inline-block max-w-[85%] ${
                                        message.role === 'user'
                                            ? 'message-user'
                                            : 'message-assistant text-left'
                                    }`}
                                >
                                    {message.role === 'user' ? (
                                        <div className="flex items-start gap-2 justify-end">
                                            <button
                                                onClick={() => handleRerun(message.content)}
                                                className="opacity-0 group-hover:opacity-100 p-1 text-text-low hover:text-brand transition-all mt-0.5"
                                                title="Rerun this message"
                                            >
                                                <RerunIcon className="w-3.5 h-3.5" />
                                            </button>
                                            <pre className="whitespace-pre-wrap font-sans leading-relaxed">
                                                {message.content}
                                            </pre>
                                        </div>
                                    ) : (
                                        <Markdown content={message.content} />
                                    )}
                                </div>
                            </div>
                        ))}

                        {isStreaming && (
                            <StreamingMessage
                                content={currentText}
                                isStreaming={true}
                                toolUses={toolUses}
                                toolResults={toolResults}
                                thinking={thinking}
                                blockedCommands={blockedCommands}
                            />
                        )}

                        {error && (
                            <div className="flex justify-center">
                                <div className="px-4 py-2 rounded-lg text-sm bg-error/10 text-error border border-error/20">
                                    Error: {error}
                                </div>
                            </div>
                        )}
                    </>
                )}
                <div ref={messagesEndRef} className="h-1" />
            </div>

            {/* Scroll to bottom button - fixed position relative to chat container */}
            {userScrolled && (isStreaming || messages.length > 0) && (
                <div className="absolute bottom-36 left-1/2 -translate-x-1/2 z-20">
                    <button
                        onClick={() => {
                            setUserScrolled(false);
                            scrollToBottom(true);
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-bg-panel border border-border rounded-full shadow-lg hover:bg-bg-secondary transition-colors"
                        title="Scroll to bottom"
                    >
                        <svg className="w-4 h-4 text-text-normal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                        </svg>
                        <span className="text-sm text-text-normal">Scroll to bottom</span>
                    </button>
                </div>
            )}

            {/* Input area - sticky at bottom */}
            <div className="flex-shrink-0 border-t border-border bg-bg-primary p-4">
                {/* Queued messages indicator */}
                {queuedMessages.length > 0 && (
                    <div className="max-w-4xl mx-auto mb-3 space-y-2">
                        <div className="flex items-center justify-between text-xs text-text-low px-1">
                            <span className="text-brand font-medium">{queuedMessages.length} message{queuedMessages.length > 1 ? 's' : ''} queued</span>
                            {queuedMessages.length > 1 && (
                                <button
                                    type="button"
                                    onClick={clearQueue}
                                    className="text-text-low hover:text-error transition-colors"
                                >
                                    Clear all
                                </button>
                            )}
                        </div>
                        {queuedMessages.map((msg, index) => (
                            <div key={index} className="flex items-center gap-2 px-3 py-2 bg-brand/10 border border-brand/20 rounded-lg text-sm">
                                <span className="text-brand font-medium text-xs">{index + 1}.</span>
                                <div className="flex-1 min-w-0">
                                    <span className="text-text-normal truncate">
                                        {msg.length > 60 ? msg.slice(0, 60) + '...' : msg}
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => clearQueueItem(index)}
                                    className="p-1 text-text-low hover:text-error transition-colors"
                                    title="Remove from queue"
                                >
                                    <XIcon className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Main input with Start/Stop/Send button */}
                <form onSubmit={handleSubmit} className="relative max-w-4xl mx-auto">
                    <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => setInput(e.currentTarget.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={
                            isStreaming
                                ? `Type to queue${queuedMessages.length > 0 ? ' another' : ' a'} follow-up message...`
                                : messages.length === 0
                                    ? 'Or type a custom message...'
                                    : 'Type a follow-up message... (Enter to send)'
                        }
                        className="chat-input text-text-high placeholder:text-text-low min-h-[100px] max-h-[300px]"
                        rows={4}
                        style={{ resize: 'vertical' }}
                    />

                    {/* Action button - Start/Stop/Send based on state */}
                    <div className="absolute right-3 bottom-3">
                        {isStreaming ? (
                            /* Stop button with spinner */
                            <button
                                type="button"
                                onClick={handleStop}
                                className="flex items-center gap-2 px-4 py-2 bg-error text-white rounded-lg hover:bg-error/90 transition-colors font-medium"
                            >
                                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Stop
                            </button>
                        ) : canStart && !hasInput ? (
                            /* Start button */
                            <button
                                type="button"
                                onClick={handleStart}
                                className="flex items-center gap-2 px-4 py-2 bg-brand text-on-brand rounded-lg hover:bg-brand-hover transition-colors font-medium"
                            >
                                <PlayIcon className="w-4 h-4" />
                                Start
                            </button>
                        ) : (
                            /* Send button */
                            <button
                                type="submit"
                                disabled={!hasInput}
                                className="flex items-center gap-2 px-4 py-2 bg-brand text-on-brand rounded-lg hover:bg-brand-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-medium"
                            >
                                <SendIcon className="w-4 h-4" />
                                Send
                            </button>
                        )}
                    </div>
                </form>
            </div>
        </div>
    );
}
