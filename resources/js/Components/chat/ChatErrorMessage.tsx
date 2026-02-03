import { cn } from '@/lib/utils';
import { AlertIcon } from '../ui/Icons';

interface ChatErrorMessageProps {
    message: string;
    className?: string;
}

export function ChatErrorMessage({ message, className }: ChatErrorMessageProps) {
    return (
        <div
            className={cn(
                'flex items-start gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg',
                className
            )}
        >
            <AlertIcon className="w-4 h-4 text-red-500 dark:text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-600 dark:text-red-400">{message}</p>
        </div>
    );
}
