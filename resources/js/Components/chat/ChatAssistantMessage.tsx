import { cn } from '@/lib/utils';
import { Markdown } from '../ui/Markdown';

interface ChatAssistantMessageProps {
    content: string;
    isStreaming?: boolean;
    className?: string;
}

export function ChatAssistantMessage({ content, isStreaming, className }: ChatAssistantMessageProps) {
    return (
        <div className={cn('max-w-4xl space-y-4', className)}>
            <div className="text-base text-gray-700 dark:text-gray-300 leading-relaxed">
                <Markdown content={content} />
                {isStreaming && (
                    <span className="inline-block w-2 h-4 bg-gray-400 dark:bg-gray-500 animate-pulse ml-0.5 align-text-bottom rounded-sm" />
                )}
            </div>
        </div>
    );
}
