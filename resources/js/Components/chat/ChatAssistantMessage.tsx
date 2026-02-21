import { cn } from '@/lib/utils';
import { Markdown } from '../ui/Markdown';

interface ChatAssistantMessageProps {
    content: string;
    isStreaming?: boolean;
    className?: string;
}

export function ChatAssistantMessage({ content, isStreaming, className }: ChatAssistantMessageProps) {
    return (
        <div className={cn('space-y-4', className)}>
            <div className="text-sm text-fg leading-relaxed">
                <Markdown content={content} />
                {isStreaming && (
                    <span className="streaming-cursor align-text-bottom rounded-sm" />
                )}
            </div>
        </div>
    );
}
