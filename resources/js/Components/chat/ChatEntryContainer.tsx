import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDownIcon, UserIcon, BotIcon, TerminalIcon, FileIcon, AlertIcon } from '../ui/Icons';

type Variant = 'user' | 'assistant' | 'tool' | 'file' | 'error' | 'system';

interface VariantConfig {
    icon: typeof UserIcon;
    border: string;
    headerBg: string;
    bg: string;
    iconColor: string;
}

const variantConfig: Record<Variant, VariantConfig> = {
    user: {
        icon: UserIcon,
        border: 'border-gray-200 dark:border-gray-700',
        headerBg: 'bg-gray-100 dark:bg-gray-700',
        bg: '',
        iconColor: 'text-gray-600 dark:text-gray-400',
    },
    assistant: {
        icon: BotIcon,
        border: 'border-gray-200 dark:border-gray-700',
        headerBg: '',
        bg: '',
        iconColor: 'text-gray-500 dark:text-gray-400',
    },
    tool: {
        icon: TerminalIcon,
        border: 'border-gray-200 dark:border-gray-700',
        headerBg: 'bg-gray-50 dark:bg-gray-800',
        bg: '',
        iconColor: 'text-gray-500 dark:text-gray-400',
    },
    file: {
        icon: FileIcon,
        border: 'border-gray-200 dark:border-gray-700',
        headerBg: 'bg-gray-50 dark:bg-gray-800',
        bg: '',
        iconColor: 'text-gray-500 dark:text-gray-400',
    },
    error: {
        icon: AlertIcon,
        border: 'border-red-300 dark:border-red-700',
        headerBg: 'bg-red-100 dark:bg-red-900/30',
        bg: 'bg-red-50 dark:bg-red-900/20',
        iconColor: 'text-red-500 dark:text-red-400',
    },
    system: {
        icon: TerminalIcon,
        border: 'border-gray-200 dark:border-gray-700',
        headerBg: 'bg-gray-100 dark:bg-gray-700',
        bg: '',
        iconColor: 'text-gray-500 dark:text-gray-400',
    },
};

interface ChatEntryContainerProps {
    variant: Variant;
    title?: ReactNode;
    subtitle?: ReactNode;
    headerRight?: ReactNode;
    expanded?: boolean;
    onToggle?: () => void;
    children?: ReactNode;
    className?: string;
    status?: 'pending' | 'running' | 'success' | 'error';
}

export function ChatEntryContainer({
    variant,
    title,
    subtitle,
    headerRight,
    expanded = true,
    onToggle,
    children,
    className,
    status,
}: ChatEntryContainerProps) {
    const config = variantConfig[variant];
    const Icon = config.icon;
    const isCollapsible = onToggle !== undefined;

    return (
        <div
            className={cn(
                'rounded-lg overflow-hidden',
                config.border && 'border',
                config.border,
                config.bg,
                className
            )}
        >
            {/* Header */}
            <div
                className={cn(
                    'flex items-center px-3 py-2 gap-2',
                    config.headerBg,
                    isCollapsible && 'cursor-pointer hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors'
                )}
                onClick={onToggle}
            >
                <span className="relative flex-shrink-0">
                    <Icon className={cn('w-4 h-4', config.iconColor)} />
                    {status && (
                        <StatusDot status={status} className="absolute -bottom-0.5 -right-0.5" />
                    )}
                </span>

                <div className="flex-1 min-w-0">
                    {title && (
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate block">
                            {title}
                        </span>
                    )}
                    {subtitle && (
                        <span className="text-xs text-gray-500 dark:text-gray-400 truncate block">
                            {subtitle}
                        </span>
                    )}
                </div>

                {headerRight}

                {isCollapsible && (
                    <ChevronDownIcon
                        className={cn(
                            'w-4 h-4 text-gray-500 dark:text-gray-400 transition-transform flex-shrink-0',
                            !expanded && '-rotate-90'
                        )}
                    />
                )}
            </div>

            {/* Content */}
            {expanded && children && (
                <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-700">
                    {children}
                </div>
            )}
        </div>
    );
}

// Status dot component
interface StatusDotProps {
    status: 'pending' | 'running' | 'success' | 'error';
    className?: string;
}

export function StatusDot({ status, className }: StatusDotProps) {
    return (
        <span className={cn('inline-flex relative', className)}>
            <span
                className={cn(
                    'w-2 h-2 rounded-full',
                    status === 'success' && 'bg-green-500 dark:bg-green-400',
                    status === 'error' && 'bg-red-500 dark:bg-red-400',
                    status === 'running' && 'bg-gray-600 dark:bg-gray-400',
                    status === 'pending' && 'bg-gray-400 dark:bg-gray-500'
                )}
            />
            {status === 'running' && (
                <span className="absolute inset-0 w-2 h-2 rounded-full bg-gray-600 dark:bg-gray-400 animate-ping" />
            )}
        </span>
    );
}
