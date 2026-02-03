import { useState } from 'react';
import { cn } from '@/lib/utils';
import { BrainIcon, ChevronDownIcon } from '../ui/Icons';

interface ChatThinkingProps {
    content: string;
    className?: string;
}

export function ChatThinking({ content, className }: ChatThinkingProps) {
    const [expanded, setExpanded] = useState(false);

    if (!content) return null;

    const preview = content.length > 100 ? content.slice(0, 100) + '...' : content;

    return (
        <div
            className={cn(
                'rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 overflow-hidden',
                className
            )}
        >
            <div
                className="flex items-start gap-2 px-3 py-2 cursor-pointer hover:bg-gray-100/50 dark:hover:bg-gray-700/50 transition-colors"
                onClick={() => setExpanded(!expanded)}
            >
                <BrainIcon className="w-4 h-4 text-gray-500 dark:text-gray-400 mt-0.5 flex-shrink-0 animate-pulse" />

                <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Thinking</span>
                    {!expanded && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 italic truncate">
                            {preview}
                        </p>
                    )}
                </div>

                <ChevronDownIcon
                    className={cn(
                        'w-4 h-4 text-gray-500 dark:text-gray-400 transition-transform flex-shrink-0',
                        !expanded && '-rotate-90'
                    )}
                />
            </div>

            {expanded && (
                <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-700">
                    <pre className="text-xs text-gray-500 dark:text-gray-400 whitespace-pre-wrap font-sans leading-relaxed max-h-64 overflow-auto">
                        {content}
                    </pre>
                </div>
            )}
        </div>
    );
}
