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
                        className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-all mt-1 flex-shrink-0"
                        title="Rerun this message"
                    >
                        <RerunIcon className="w-3.5 h-3.5" />
                    </button>
                )}
                <div className="pl-4 py-2 border-l-2 border-gray-200 dark:border-gray-700">
                    <pre className="whitespace-pre-wrap font-sans text-sm text-gray-600 dark:text-gray-400 leading-relaxed italic">
                        {content}
                    </pre>
                </div>
            </div>
        </div>
    );
}
