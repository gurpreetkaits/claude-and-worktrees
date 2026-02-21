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
import { SparklesIcon, CheckCircleIcon, XIcon } from '../ui/Icons';
import { parseCommand, getCommandByName, executeCommand, CommandContext } from './CommandExecutor';
import { Markdown } from '../ui/Markdown';

// Completion banner
function CompletionBanner({ costUsd, durationMs, onDismiss }: { costUsd: number | null; durationMs: number | null; onDismiss: () => void }) {
    useEffect(() => {
        const timer = setTimeout(onDismiss, 10000);
        return () => clearTimeout(timer);
    }, [onDismiss]);

    return (
        <div className="animate-fade-in mx-auto max-w-3xl mb-4">
            <div className="flex items-center gap-3 px-4 py-2.5 bg-bg-muted border border-border rounded-md">
                <CheckCircleIcon className="w-4 h-4 text-success flex-shrink-0" />
                <span className="text-xs font-medium text-fg flex-1">Task completed</span>
                <div className="flex items-center gap-2 text-[11px] text-fg-muted">
                    {costUsd !== null && <span>${costUsd.toFixed(4)}</span>}
                    {durationMs !== null && <span>{(durationMs / 1000).toFixed(1)}s</span>}
                </div>
                <button onClick={onDismiss} className="p-0.5 text-fg-muted hover:text-fg rounded transition-colors">
                    <XIcon className="w-3 h-3" />
                </button>
            </div>
        </div>
    );
}

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
    const [showCompletionBanner, setShowCompletionBanner] = useState(false);

    const {
        isStreaming, currentText, error, toolUses, toolResults, thinking,
        costUsd, durationMs, queuedMessages, lastUserMessage, lastCompletedMessage,
        completionCount, sendMessage, queueMessage, clearQueue, clearQueueItem,
        cancel, setDraftInput, getDraftInput,
    } = useTodoSession(todo.id);

    const setInput = useCallback((value: string) => {
        setInputLocal(value);
        setDraftInput(value);
    }, [setDraftInput]);

    useEffect(() => {
        setInputLocal(getDraftInput());
    }, [todo.id, getDraftInput]);

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
        setUserScrolled(scrollHeight - scrollTop - clientHeight > 50);
    }, []);

    const scrollToBottom = useCallback((instant = false) => {
        requestAnimationFrame(() => {
            messagesEndRef.current?.scrollIntoView({
                behavior: instant ? 'instant' : 'smooth',
                block: 'end'
            });
        });
    }, []);

    const prevIsStreaming = useRef(isStreaming);
    useEffect(() => {
        if (prevIsStreaming.current && !isStreaming) {
            setUserScrolled(false);
            scrollToBottom(false);
            if (messages.length > 0 || currentText) {
                setShowCompletionBanner(true);
            }
        }
        prevIsStreaming.current = isStreaming;
    }, [isStreaming, scrollToBottom, messages.length, currentText]);

    useEffect(() => {
        if (!userScrolled) scrollToBottom(false);
    }, [messages.length, scrollToBottom, userScrolled]);

    const lastScrollTime = useRef(0);
    useEffect(() => {
        if (!isStreaming) return;
        const now = Date.now();
        if (now - lastScrollTime.current > 80) {
            lastScrollTime.current = now;
            scrollToBottom(false);
        }
    }, [currentText, isStreaming, scrollToBottom]);

    useEffect(() => {
        setImages([]);
        setToolsExpanded(false);
    }, [todo.id]);

    const addSystemMessage = useCallback((content: string, type: 'info' | 'error' = 'info') => {
        const msg: SystemMessage = {
            id: `sys_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            type, content, timestamp: Date.now(),
        };
        setSystemMessages(prev => [...prev, msg]);
        if (type === 'info') {
            setTimeout(() => {
                setSystemMessages(prev => prev.filter(m => m.id !== msg.id));
            }, 30000);
        }
    }, []);

    const clearSystemMessages = useCallback(() => setSystemMessages([]), []);

    // Handlers
    const handleSubmit = useCallback(async () => {
        if (!input.trim() && images.length === 0) return;

        const userMessage = input.trim();
        const attachedImages = images.map(img => ({ data: img.data, mediaType: img.mediaType }));

        const parsedCommand = parseCommand(userMessage);
        if (parsedCommand && images.length === 0) {
            const command = getCommandByName(parsedCommand.command);
            if (command) {
                setInput('');
                setUserScrolled(false);
                const context: CommandContext = {
                    todoId: todo.id,
                    worktreePath: todo.worktree?.path,
                    sendMessage: (content) => sendMessage(content),
                    clearMessages: clearSystemMessages,
                    costUsd, durationMs, toolUses,
                    messages: messages.map(m => ({ role: m.role, content: m.content })),
                };
                const result = await executeCommand(command, userMessage, context);
                if (result.message) addSystemMessage(result.message, 'info');
                if (result.error) addSystemMessage(result.error, 'error');
                return;
            }
        }

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

    const toolResultsMap = new Map<string, ToolResult>();
    toolResults.forEach(result => {
        if (result.tool_use_id) toolResultsMap.set(result.tool_use_id, result);
    });

    const hasInput = input.trim().length > 0 || images.length > 0;
    const canStart = messages.length === 0 && todo.context && !isStreaming;
    const status: 'idle' | 'running' | 'queued' | 'stopping' =
        queuedMessages.length > 0 && isStreaming ? 'queued' : isStreaming ? 'running' : 'idle';

    return (
        <div className={cn('h-full flex flex-col bg-bg', className)}>
            {/* Stats bar */}
            {(costUsd !== null || durationMs !== null) && (
                <div className="flex-shrink-0 border-b border-border px-6 py-1.5">
                    <div className="flex items-center justify-end gap-2 text-[11px] text-fg-muted">
                        {costUsd !== null && <span>${costUsd.toFixed(4)}</span>}
                        {costUsd !== null && durationMs !== null && <span className="text-border-strong">&middot;</span>}
                        {durationMs !== null && <span>{(durationMs / 1000).toFixed(1)}s</span>}
                    </div>
                </div>
            )}

            {/* Messages */}
            <div
                ref={messagesContainerRef}
                onScroll={handleScroll}
                className="flex-1 min-h-0 overflow-y-auto"
            >
                {messages.length === 0 && !isStreaming && systemMessages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8">
                        <div className="w-10 h-10 rounded-full bg-bg-muted border border-border flex items-center justify-center mb-4">
                            <SparklesIcon className="w-5 h-5 text-fg-muted" />
                        </div>
                        <h3 className="text-sm font-medium text-fg-secondary mb-1">Ready to work</h3>
                        {todo.context ? (
                            <p className="text-xs text-fg-muted max-w-sm">
                                Press <span className="text-fg font-medium">Start</span> to begin or type <span className="text-fg font-medium">/help</span> for commands.
                            </p>
                        ) : (
                            <p className="text-xs text-fg-muted max-w-sm">
                                No context provided. Add context or type <span className="text-fg font-medium">/help</span>.
                            </p>
                        )}
                    </div>
                ) : (
                    <div className="p-6 space-y-5 max-w-3xl mx-auto">
                        {messages.map((message) => (
                            <div key={message.id}>
                                {message.role === 'user' ? (
                                    <ChatUserMessage content={message.content} onRerun={() => handleRerun(message.content)} />
                                ) : (
                                    <ChatAssistantMessage content={message.content} />
                                )}
                            </div>
                        ))}

                        {/* Streaming */}
                        {isStreaming && (
                            <div className="space-y-3">
                                {thinking && <ChatThinking content={thinking} />}
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
                                {currentText && <ChatAssistantMessage content={currentText} isStreaming={true} />}
                            </div>
                        )}

                        {/* System messages */}
                        {systemMessages.map((sysMsg) => (
                            <div
                                key={sysMsg.id}
                                className={cn(
                                    'rounded-md border p-3',
                                    sysMsg.type === 'error' ? 'bg-error/5 border-error/20' : 'bg-bg-muted border-border'
                                )}
                            >
                                <div className="text-xs text-fg-secondary">
                                    <Markdown content={sysMsg.content} />
                                </div>
                            </div>
                        ))}

                        {error && <ChatErrorMessage message={error} />}
                    </div>
                )}

                <div ref={messagesEndRef} className="h-8" style={{ overflowAnchor: 'auto' }} />
            </div>

            {/* Completion banner */}
            {showCompletionBanner && !isStreaming && (
                <CompletionBanner costUsd={costUsd} durationMs={durationMs} onDismiss={() => setShowCompletionBanner(false)} />
            )}

            {/* Scroll to bottom */}
            {userScrolled && (isStreaming || messages.length > 0) && (
                <div className="flex justify-center py-2">
                    <button
                        onClick={() => { setUserScrolled(false); scrollToBottom(true); }}
                        className="flex items-center gap-1.5 px-3 py-1 bg-bg border border-border shadow-sm rounded-full text-[11px] text-fg-secondary hover:bg-bg-muted transition-all"
                    >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                        </svg>
                        Scroll to bottom
                    </button>
                </div>
            )}

            {/* Input */}
            <ChatInput
                todoId={todo.id}
                value={input}
                onChange={setInput}
                onSubmit={handleSubmit}
                onStop={cancel}
                onQueue={() => {
                    const userMessage = input.trim();
                    const attachedImages = images.map(img => ({ data: img.data, mediaType: img.mediaType }));
                    setInput('');
                    setImages([]);
                    queueMessage(userMessage, attachedImages.length > 0 ? attachedImages : undefined);
                }}
                status={status}
                placeholder={messages.length === 0 ? 'Or type a custom message...' : 'Type a follow-up message...'}
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
