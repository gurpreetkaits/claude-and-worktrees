import { cn } from '@/lib/utils';
import { AlertIcon } from '../ui/Icons';

interface ChatErrorMessageProps {
    message: string;
    className?: string;
}

export function ChatErrorMessage({ message, className }: ChatErrorMessageProps) {
    return (
        <div className={cn('flex items-start gap-2 px-3 py-2 bg-error/5 border border-error/20 rounded-md', className)}>
            <AlertIcon className="w-4 h-4 text-error mt-0.5 flex-shrink-0" />
            <p className="text-xs text-error">{message}</p>
        </div>
    );
}
