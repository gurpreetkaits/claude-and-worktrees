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
        <div className={cn('rounded-md border border-border overflow-hidden', className)}>
            <div
                className="flex items-start gap-2 px-3 py-2 cursor-pointer hover:bg-bg-muted transition-colors"
                onClick={() => setExpanded(!expanded)}
            >
                <BrainIcon className="w-4 h-4 text-fg-muted mt-0.5 flex-shrink-0 animate-pulse-subtle" />
                <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium text-fg-muted">Thinking</span>
                    {!expanded && (
                        <p className="text-[11px] text-fg-muted mt-0.5 italic truncate">{preview}</p>
                    )}
                </div>
                <ChevronDownIcon className={cn('w-3.5 h-3.5 text-fg-muted transition-transform flex-shrink-0', !expanded && '-rotate-90')} />
            </div>

            {expanded && (
                <div className="px-3 py-2 border-t border-border bg-bg-secondary">
                    <pre className="text-[11px] text-fg-muted whitespace-pre-wrap font-sans leading-relaxed max-h-64 overflow-auto">
                        {content}
                    </pre>
                </div>
            )}
        </div>
    );
}
