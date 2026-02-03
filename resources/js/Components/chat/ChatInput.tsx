import { useRef, ClipboardEvent, FormEvent, KeyboardEvent, useState, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { SendIcon, StopIcon, PlayIcon, PaperclipIcon, XIcon, ClockIcon, CommandIcon } from '../ui/Icons';
import { SlashCommandMenu, useSlashCommands, SlashCommand } from './SlashCommands';

export interface ImageAttachment {
    id: string;
    data: string;
    mediaType: string;
    preview: string;
}

interface QueuedMessage {
    content: string;
    images?: { data: string; mediaType: string }[];
}

type ChatStatus = 'idle' | 'running' | 'queued' | 'stopping';

interface ChatInputProps {
    value: string;
    onChange: (value: string) => void;
    onSubmit: () => void;
    onStop?: () => void;
    onQueue?: () => void;
    status: ChatStatus;
    placeholder?: string;
    disabled?: boolean;
    images?: ImageAttachment[];
    onAddImage?: (image: ImageAttachment) => void;
    onRemoveImage?: (id: string) => void;
    queuedMessages?: QueuedMessage[];
    onClearQueue?: () => void;
    onClearQueueItem?: (index: number) => void;
    canStart?: boolean;
    onStart?: () => void;
    className?: string;
    todoId?: number; // Used to detect task switches for auto-focus
    autoFocus?: boolean;
}

export function ChatInput({
    value,
    onChange,
    onSubmit,
    onStop,
    onQueue,
    status,
    placeholder = 'Type a message...',
    disabled = false,
    images = [],
    onAddImage,
    onRemoveImage,
    queuedMessages = [],
    onClearQueue,
    onClearQueueItem,
    canStart = false,
    onStart,
    className,
    todoId,
    autoFocus = true,
}: ChatInputProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Auto-focus on mount and when task changes
    useEffect(() => {
        if (autoFocus && textareaRef.current) {
            // Small delay to ensure DOM is ready
            const timer = setTimeout(() => {
                textareaRef.current?.focus();
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [todoId, autoFocus]);

    // Slash commands
    const handleSlashCommandSelect = useCallback((command: SlashCommand, newInput: string) => {
        onChange(newInput);
        // Focus the textarea and move cursor to end
        setTimeout(() => {
            textareaRef.current?.focus();
            textareaRef.current?.setSelectionRange(newInput.length, newInput.length);
        }, 0);
    }, [onChange]);

    const {
        showMenu: showSlashMenu,
        selectedIndex: slashSelectedIndex,
        setSelectedIndex: setSlashSelectedIndex,
        query: slashQuery,
        handleSelect: handleSlashSelect,
        handleClose: handleSlashClose,
    } = useSlashCommands(value, handleSlashCommandSelect);

    const isRunning = status === 'running' || status === 'queued';
    const hasContent = value.trim().length > 0 || images.length > 0;
    const canSend = hasContent && status !== 'stopping';
    const isQueued = status === 'queued';

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (!canSend) return;

        if (isRunning && onQueue) {
            onQueue();
        } else {
            onSubmit();
        }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
        // Let slash command menu handle navigation keys when open (but NOT Enter)
        if (showSlashMenu && ['ArrowUp', 'ArrowDown', 'Escape'].includes(e.key)) {
            // These are handled by the SlashCommandMenu
            return;
        }

        // Tab to autocomplete from menu
        if (e.key === 'Tab' && showSlashMenu) {
            // Let menu handle Tab for autocomplete
            return;
        }

        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            // Close slash menu if open
            if (showSlashMenu) {
                handleSlashClose();
            }
            if (canSend) {
                if (isRunning && onQueue) {
                    onQueue();
                } else {
                    onSubmit();
                }
            }
        }
    };

    const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
        const items = e.clipboardData?.items;
        if (!items || !onAddImage) return;

        for (const item of items) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                if (!file) continue;

                const reader = new FileReader();
                reader.onload = (event) => {
                    const dataUrl = event.target?.result as string;
                    if (!dataUrl) return;

                    const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
                    if (!matches) return;

                    const [, mediaType, data] = matches;
                    onAddImage({
                        id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
                        data,
                        mediaType,
                        preview: dataUrl,
                    });
                };
                reader.readAsDataURL(file);
            }
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'));
        if (!onAddImage) return;

        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = (event) => {
                const dataUrl = event.target?.result as string;
                if (!dataUrl) return;

                const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
                if (!matches) return;

                const [, mediaType, data] = matches;
                onAddImage({
                    id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
                    data,
                    mediaType,
                    preview: dataUrl,
                });
            };
            reader.readAsDataURL(file);
        });
        e.target.value = '';
    };

    const renderActionButton = () => {
        if (status === 'stopping') {
            return (
                <button
                    type="button"
                    disabled
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-lg text-xs font-medium"
                >
                    <span className="w-3.5 h-3.5 border-2 border-gray-400/30 border-t-gray-400 rounded-full animate-spin" />
                    Stopping
                </button>
            );
        }

        if (isRunning && onStop) {
            return (
                <div className="flex items-center gap-2">
                    {canSend && onQueue && (
                        <button
                            type="submit"
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900 rounded-lg transition-colors text-xs font-medium hover:bg-gray-700 dark:hover:bg-gray-300"
                        >
                            <ClockIcon className="w-3.5 h-3.5" />
                            Queue
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onStop}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-700 dark:hover:text-red-300 rounded-lg text-xs font-medium transition-colors"
                    >
                        <div className="w-2 h-2 bg-red-500 rounded-full" />
                        Stop
                    </button>
                </div>
            );
        }

        if (canStart && !hasContent && onStart) {
            return (
                <button
                    type="button"
                    onClick={onStart}
                    className="flex items-center gap-2 px-4 py-1.5 bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900 rounded-lg transition-colors text-sm font-medium hover:bg-gray-700 dark:hover:bg-gray-300"
                >
                    <PlayIcon className="w-3.5 h-3.5 fill-current" />
                    Start
                </button>
            );
        }

        return (
            <button
                type="submit"
                disabled={!canSend || disabled}
                className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                    canSend && !disabled
                        ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-300'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                )}
            >
                <SendIcon className="w-3.5 h-3.5" />
                Send
            </button>
        );
    };

    return (
        <div className={cn('flex-shrink-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 p-4', className)}>
            <div className="max-w-4xl mx-auto w-full relative">
                {/* Queued messages banner */}
                {queuedMessages.length > 0 && (
                    <div className="mb-3 px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                                {queuedMessages.length} message{queuedMessages.length > 1 ? 's' : ''} queued
                            </span>
                            {queuedMessages.length > 1 && onClearQueue && (
                                <button
                                    type="button"
                                    onClick={onClearQueue}
                                    className="text-xs text-gray-500 hover:text-red-500 transition-colors"
                                >
                                    Clear all
                                </button>
                            )}
                        </div>
                        <div className="space-y-1">
                            {queuedMessages.map((msg, index) => (
                                <div key={index} className="flex items-center gap-2 text-xs">
                                    <ClockIcon className="w-3 h-3 text-gray-400 flex-shrink-0" />
                                    <span className="flex-1 truncate text-gray-600 dark:text-gray-400">
                                        {msg.content.length > 50 ? msg.content.slice(0, 50) + '...' : msg.content}
                                    </span>
                                    {onClearQueueItem && (
                                        <button
                                            type="button"
                                            onClick={() => onClearQueueItem(index)}
                                            className="p-0.5 text-gray-400 hover:text-red-500 transition-colors"
                                        >
                                            <XIcon className="w-3 h-3" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Main input container */}
                <div className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl shadow-sm focus-within:shadow-md focus-within:border-gray-400 dark:focus-within:border-gray-500 focus-within:ring-1 focus-within:ring-gray-100 dark:focus-within:ring-gray-700 transition-all overflow-hidden">
                    {/* Image previews */}
                    {images.length > 0 && (
                        <div className="flex flex-wrap gap-2 p-3 border-b border-gray-100 dark:border-gray-700">
                            {images.map(img => (
                                <div key={img.id} className="relative group/img">
                                    <img
                                        src={img.preview}
                                        alt="Attached"
                                        className="h-12 w-auto rounded-lg border border-gray-200 dark:border-gray-700 object-cover"
                                    />
                                    {onRemoveImage && (
                                        <button
                                            type="button"
                                            onClick={() => onRemoveImage(img.id)}
                                            className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity shadow-sm"
                                        >
                                            <XIcon className="w-3 h-3" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Slash command menu */}
                    {showSlashMenu && (
                        <SlashCommandMenu
                            query={slashQuery}
                            onSelect={handleSlashSelect}
                            onClose={handleSlashClose}
                            selectedIndex={slashSelectedIndex}
                            onSelectedIndexChange={setSlashSelectedIndex}
                        />
                    )}

                    <form onSubmit={handleSubmit}>
                        <textarea
                            ref={textareaRef}
                            value={value}
                            onChange={(e) => onChange(e.target.value)}
                            onKeyDown={handleKeyDown}
                            onPaste={handlePaste}
                            placeholder={isRunning ? 'Type to queue a follow-up...' : placeholder}
                            disabled={disabled || status === 'stopping'}
                            className="w-full max-h-60 min-h-[56px] p-3 resize-none outline-none text-base text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 bg-transparent"
                            rows={2}
                        />

                        {/* Footer toolbar */}
                        <div className="flex items-center justify-between px-2 pb-2">
                            <div className="flex items-center gap-1">
                                {onAddImage && (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => fileInputRef.current?.click()}
                                            disabled={disabled || isRunning}
                                            className="p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                                            title="Attach file"
                                        >
                                            <PaperclipIcon className="w-4 h-4" />
                                        </button>
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept="image/*"
                                            multiple
                                            className="hidden"
                                            onChange={handleFileSelect}
                                        />
                                    </>
                                )}
                            </div>

                            <div className="flex items-center gap-3">
                                <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1 hidden sm:flex">
                                    <CommandIcon className="w-3 h-3" />
                                    + Enter to send
                                </span>
                                {renderActionButton()}
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
