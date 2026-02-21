import { cn } from '@/lib/utils';
import { RerunIcon } from '../ui/Icons';

interface ChatUserMessageProps {
    content: string;
    onRerun?: () => void;
    className?: string;
}

export function ChatUserMessage({ content, onRerun, className }: ChatUserMessageProps) {
    return (
        <div className={cn('group flex justify-end', className)}>
            <div className="flex items-start gap-2 max-w-[85%]">
                {onRerun && (
                    <button
                        onClick={onRerun}
                        className="opacity-0 group-hover:opacity-100 p-1 text-fg-muted hover:text-fg-secondary transition-all mt-1 flex-shrink-0"
                        title="Rerun this message"
                    >
                        <RerunIcon className="w-3.5 h-3.5" />
                    </button>
                )}
                <div className="bg-bg-muted rounded-lg rounded-tr-sm px-4 py-2.5">
                    <pre className="whitespace-pre-wrap font-sans text-sm text-fg leading-relaxed">
                        {content}
                    </pre>
                </div>
            </div>
        </div>
    );
}
