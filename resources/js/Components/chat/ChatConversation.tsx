import { useRef, useEffect, useCallback, useState } from 'react';
import { Message, Todo } from '@/types';
import { cn } from '@/lib/utils';
import { ChatUserMessage } from './ChatUserMessage';
import { ChatAssistantMessage } from './ChatAssistantMessage';
import { ChatToolEntry, ChatToolSummary } from './ChatToolEntry';
import { ChatThinking } from './ChatThinking';
import { ChatErrorMessage } from './ChatErrorMessage';
import { ChatInput, ImageAttachment } from './ChatInput';
import { useTodoSession } from '@/hooks/useConcurrentSessions';
import { SparklesIcon } from '../ui/Icons';
import { parseCommand, getCommandByName, executeCommand, CommandContext } from './CommandExecutor';
import { Markdown } from '../ui/Markdown';

// System message for command results
interface SystemMessage {
    id: string;
    type: 'info' | 'error';
    content: string;
    timestamp: number;
}

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

interface ChatConversationProps {
    todo: Todo;
    messages: Message[];
    onNewMessage: (message: Message) => void;
    className?: string;
}

export function ChatConversation({ todo, messages, onNewMessage, className }: ChatConversationProps) {
    const [input, setInputLocal] = useState('');
    const [images, setImages] = useState<ImageAttachment[]>([]);
    const [toolsExpanded, setToolsExpanded] = useState(false);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [userScrolled, setUserScrolled] = useState(false);
    const [systemMessages, setSystemMessages] = useState<SystemMessage[]>([]);

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
        sendMessage,
        queueMessage,
        clearQueue,
        clearQueueItem,
        cancel,
        setDraftInput,
        getDraftInput,
    } = useTodoSession(todo.id);

    // Sync input with draft storage
    const setInput = useCallback((value: string) => {
        setInputLocal(value);
        setDraftInput(value);
    }, [setDraftInput]);

    useEffect(() => {
        setInputLocal(getDraftInput());
    }, [todo.id, getDraftInput]);

    // Track processed messages
    const lastProcessedUserMessageId = useRef<number | null>(null);
    const lastProcessedCompletionCount = useRef(0);
    const currentTodoId = useRef(todo.id);
    const onNewMessageRef = useRef(onNewMessage);
    onNewMessageRef.current = onNewMessage;

    useEffect(() => {
        if (currentTodoId.current !== todo.id) {
            currentTodoId.current = todo.id;
            lastProcessedUserMessageId.current = null;
            lastProcessedCompletionCount.current = 0;
        }
    }, [todo.id]);

    useEffect(() => {
        if (lastUserMessage && lastUserMessage.id !== lastProcessedUserMessageId.current) {
            lastProcessedUserMessageId.current = lastUserMessage.id;
            onNewMessageRef.current(lastUserMessage);
        }
    }, [lastUserMessage]);

    useEffect(() => {
        if (completionCount > lastProcessedCompletionCount.current && lastCompletedMessage) {
            lastProcessedCompletionCount.current = completionCount;
            onNewMessageRef.current(lastCompletedMessage);
        }
    }, [completionCount, lastCompletedMessage]);

    // Scrolling
    const handleScroll = useCallback(() => {
        if (!messagesContainerRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
        setUserScrolled(!isAtBottom);
    }, []);

    const scrollToBottom = useCallback((instant = false) => {
        if (userScrolled) return;
        messagesEndRef.current?.scrollIntoView({
            behavior: instant ? 'instant' : 'smooth',
            block: 'end'
        });
    }, [userScrolled]);

    useEffect(() => {
        if (!isStreaming && !userScrolled) {
            scrollToBottom(false);
        }
    }, [messages.length, isStreaming, scrollToBottom, userScrolled]);

    // Scroll during streaming
    const lastScrollTime = useRef(0);
    useEffect(() => {
        if (!isStreaming || userScrolled) return;
        const now = Date.now();
        if (now - lastScrollTime.current > 100) {
            lastScrollTime.current = now;
            scrollToBottom(false);
        }
    }, [currentText, isStreaming, userScrolled, scrollToBottom]);

    // Clear images on todo change
    useEffect(() => {
        setImages([]);
        setToolsExpanded(false);
    }, [todo.id]);

    // Add a system message (for command results)
    const addSystemMessage = useCallback((content: string, type: 'info' | 'error' = 'info') => {
        const msg: SystemMessage = {
            id: `sys_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            type,
            content,
            timestamp: Date.now(),
        };
        setSystemMessages(prev => [...prev, msg]);

        // Auto-remove after 30 seconds for info messages
        if (type === 'info') {
            setTimeout(() => {
                setSystemMessages(prev => prev.filter(m => m.id !== msg.id));
            }, 30000);
        }
    }, []);

    // Clear system messages
    const clearSystemMessages = useCallback(() => {
        setSystemMessages([]);
    }, []);

    // Handlers
    const handleSubmit = useCallback(async () => {
        if (!input.trim() && images.length === 0) return;

        const userMessage = input.trim();
        const attachedImages = images.map(img => ({
            data: img.data,
            mediaType: img.mediaType,
        }));

        // Check if it's a slash command
        const parsedCommand = parseCommand(userMessage);
        if (parsedCommand && images.length === 0) {
            const command = getCommandByName(parsedCommand.command);
            if (command) {
                setInput('');
                setUserScrolled(false);

                // Build command context
                const context: CommandContext = {
                    todoId: todo.id,
                    worktreePath: todo.worktree?.path,
                    sendMessage: (content) => sendMessage(content),
                    clearMessages: clearSystemMessages,
                    costUsd,
                    durationMs,
                    toolUses,
                    messages: messages.map(m => ({ role: m.role, content: m.content })),
                };

                // Execute the command
                const result = await executeCommand(command, userMessage, context);

                if (result.message) {
                    addSystemMessage(result.message, 'info');
                }
                if (result.error) {
                    addSystemMessage(result.error, 'error');
                }

                return;
            }
        }

        // Regular message handling
        setInput('');
        setImages([]);
        setUserScrolled(false);

        if (isStreaming) {
            queueMessage(userMessage, attachedImages.length > 0 ? attachedImages : undefined);
        } else {
            sendMessage(userMessage, attachedImages.length > 0 ? attachedImages : undefined);
        }
    }, [input, images, isStreaming, queueMessage, sendMessage, setInput, todo.id, todo.worktree?.path, costUsd, durationMs, toolUses, messages, addSystemMessage, clearSystemMessages]);

    const handleStart = useCallback(() => {
        if (todo.context && !isStreaming) {
            setUserScrolled(false);
            sendMessage(todo.context);
        }
    }, [todo.context, isStreaming, sendMessage]);

    const handleRerun = useCallback((content: string) => {
        setUserScrolled(false);
        if (isStreaming) {
            cancel().then(() => setTimeout(() => sendMessage(content), 100));
        } else {
            sendMessage(content);
        }
    }, [isStreaming, cancel, sendMessage]);

    const handleAddImage = useCallback((image: ImageAttachment) => {
        setImages(prev => [...prev, image]);
    }, []);

    const handleRemoveImage = useCallback((id: string) => {
        setImages(prev => prev.filter(img => img.id !== id));
    }, []);

    // Get tool results map
    const toolResultsMap = new Map<string, ToolResult>();
    toolResults.forEach(result => {
        if (result.tool_use_id) {
            toolResultsMap.set(result.tool_use_id, result);
        }
    });

    const lastUserMessageFromHistory = [...messages].reverse().find(m => m.role === 'user');
    const hasInput = input.trim().length > 0 || images.length > 0;
    const canStart = messages.length === 0 && todo.context && !isStreaming;

    const status: 'idle' | 'running' | 'queued' | 'stopping' =
        queuedMessages.length > 0 && isStreaming ? 'queued' : isStreaming ? 'running' : 'idle';

    return (
        <div className={cn('h-full flex flex-col bg-white dark:bg-gray-900', className)}>
            {/* Stats bar - only show when there are stats */}
            {(costUsd !== null || durationMs !== null) && (
                <div className="flex-shrink-0 border-b border-gray-100 dark:border-gray-800 px-6 py-2">
                    <div className="flex items-center justify-end gap-3 text-xs text-gray-500 dark:text-gray-400">
                        {costUsd !== null && (
                            <span className="font-medium">${costUsd.toFixed(4)}</span>
                        )}
                        {costUsd !== null && durationMs !== null && (
                            <span className="text-gray-300 dark:text-gray-600">·</span>
                        )}
                        {durationMs !== null && (
                            <span>{(durationMs / 1000).toFixed(1)}s</span>
                        )}
                    </div>
                </div>
            )}

            {/* Messages - scrollable area */}
            <div
                ref={messagesContainerRef}
                onScroll={handleScroll}
                className="flex-1 min-h-0 overflow-y-auto"
            >
                {messages.length === 0 && !isStreaming && systemMessages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8">
                        <div className="w-12 h-12 rounded-full bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 flex items-center justify-center mb-4">
                            <SparklesIcon className="w-6 h-6 text-gray-400 dark:text-gray-500" />
                        </div>
                        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Ready to work</h3>
                        {todo.context ? (
                            <p className="text-sm text-gray-400 dark:text-gray-500 max-w-sm">
                                Press <span className="text-gray-600 dark:text-gray-300 font-medium">Start</span> to begin or type <span className="text-gray-700 dark:text-gray-300 font-medium">/help</span> for a list of available commands.
                            </p>
                        ) : (
                            <p className="text-sm text-gray-400 dark:text-gray-500 max-w-sm">
                                No context provided. Add context or type <span className="text-gray-700 dark:text-gray-300 font-medium">/help</span> for commands.
                            </p>
                        )}
                    </div>
                ) : (
                    <div className="p-6 space-y-4 max-w-4xl mx-auto">
                        {messages.map((message) => (
                            <div key={message.id}>
                                {message.role === 'user' ? (
                                    <ChatUserMessage
                                        content={message.content}
                                        onRerun={() => handleRerun(message.content)}
                                    />
                                ) : (
                                    <ChatAssistantMessage content={message.content} />
                                )}
                            </div>
                        ))}

                        {/* Streaming content */}
                        {isStreaming && (
                            <div className="space-y-3">
                                {/* Thinking */}
                                {thinking && <ChatThinking content={thinking} />}

                                {/* Tool uses */}
                                {toolUses.length > 0 && (
                                    <>
                                        {toolsExpanded ? (
                                            <div className="space-y-2">
                                                {toolUses.map((tool, index) => (
                                                    <ChatToolEntry
                                                        key={tool.id || index}
                                                        id={tool.id || String(index)}
                                                        tool={tool.tool}
                                                        input={tool.input}
                                                        result={tool.id ? toolResultsMap.get(tool.id) : undefined}
                                                    />
                                                ))}
                                            </div>
                                        ) : (
                                            <ChatToolSummary
                                                tools={toolUses.map((tool, index) => ({
                                                    id: tool.id || String(index),
                                                    tool: tool.tool,
                                                    input: tool.input,
                                                    result: tool.id ? toolResultsMap.get(tool.id) : undefined,
                                                }))}
                                                onExpand={() => setToolsExpanded(true)}
                                            />
                                        )}
                                    </>
                                )}

                                {/* Current text */}
                                {currentText && (
                                    <ChatAssistantMessage content={currentText} isStreaming={true} />
                                )}
                            </div>
                        )}

                        {/* System messages from commands */}
                        {systemMessages.map((sysMsg) => (
                            <div
                                key={sysMsg.id}
                                className={cn(
                                    'rounded-lg border p-4',
                                    sysMsg.type === 'error'
                                        ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                                        : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                                )}
                            >
                                <div className="text-sm text-gray-700 dark:text-gray-300">
                                    <Markdown content={sysMsg.content} />
                                </div>
                            </div>
                        ))}

                        {/* Error */}
                        {error && <ChatErrorMessage message={error} />}
                    </div>
                )}

                <div ref={messagesEndRef} className="h-8" />
            </div>

            {/* Scroll to bottom button - positioned above input */}
            {userScrolled && (isStreaming || messages.length > 0) && (
                <div className="flex justify-center py-2">
                    <button
                        onClick={() => {
                            setUserScrolled(false);
                            scrollToBottom(true);
                        }}
                        className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm rounded-full text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100 transition-all"
                    >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                        </svg>
                        Scroll to bottom
                    </button>
                </div>
            )}

            {/* Input - sticky at bottom */}
            <ChatInput
                todoId={todo.id}
                value={input}
                onChange={setInput}
                onSubmit={handleSubmit}
                onStop={cancel}
                onQueue={() => {
                    const userMessage = input.trim();
                    const attachedImages = images.map(img => ({
                        data: img.data,
                        mediaType: img.mediaType,
                    }));
                    setInput('');
                    setImages([]);
                    queueMessage(userMessage, attachedImages.length > 0 ? attachedImages : undefined);
                }}
                status={status}
                placeholder={messages.length === 0
                    ? 'Or type a custom message...'
                    : 'Type a follow-up message...'}
                images={images}
                onAddImage={handleAddImage}
                onRemoveImage={handleRemoveImage}
                queuedMessages={queuedMessages}
                onClearQueue={clearQueue}
                onClearQueueItem={clearQueueItem}
                canStart={!!canStart && !hasInput}
                onStart={handleStart}
                autoFocus={true}
            />
        </div>
    );
}
