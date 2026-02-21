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
    user: { icon: UserIcon, border: 'border-border', headerBg: 'bg-bg-muted', bg: '', iconColor: 'text-fg-secondary' },
    assistant: { icon: BotIcon, border: 'border-border', headerBg: '', bg: '', iconColor: 'text-fg-muted' },
    tool: { icon: TerminalIcon, border: 'border-border', headerBg: 'bg-bg-secondary', bg: '', iconColor: 'text-fg-muted' },
    file: { icon: FileIcon, border: 'border-border', headerBg: 'bg-bg-secondary', bg: '', iconColor: 'text-fg-muted' },
    error: { icon: AlertIcon, border: 'border-error/30', headerBg: 'bg-error/5', bg: 'bg-error/5', iconColor: 'text-error' },
    system: { icon: TerminalIcon, border: 'border-border', headerBg: 'bg-bg-muted', bg: '', iconColor: 'text-fg-muted' },
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
    variant, title, subtitle, headerRight, expanded = true,
    onToggle, children, className, status,
}: ChatEntryContainerProps) {
    const config = variantConfig[variant];
    const Icon = config.icon;
    const isCollapsible = onToggle !== undefined;

    return (
        <div className={cn('rounded-md overflow-hidden', config.border && 'border', config.border, config.bg, className)}>
            <div
                className={cn(
                    'flex items-center px-3 py-2 gap-2',
                    config.headerBg,
                    isCollapsible && 'cursor-pointer hover:bg-bg-muted transition-colors'
                )}
                onClick={onToggle}
            >
                <span className="relative flex-shrink-0">
                    <Icon className={cn('w-4 h-4', config.iconColor)} />
                    {status && <StatusDot status={status} className="absolute -bottom-0.5 -right-0.5" />}
                </span>
                <div className="flex-1 min-w-0">
                    {title && <span className="text-xs font-medium text-fg truncate block">{title}</span>}
                    {subtitle && <span className="text-[11px] text-fg-muted truncate block">{subtitle}</span>}
                </div>
                {headerRight}
                {isCollapsible && (
                    <ChevronDownIcon className={cn('w-3.5 h-3.5 text-fg-muted transition-transform flex-shrink-0', !expanded && '-rotate-90')} />
                )}
            </div>
            {expanded && children && (
                <div className="px-3 py-2 border-t border-border">{children}</div>
            )}
        </div>
    );
}

// Status dot
interface StatusDotProps {
    status: 'pending' | 'running' | 'success' | 'error';
    className?: string;
}

export function StatusDot({ status, className }: StatusDotProps) {
    return (
        <span className={cn('inline-flex relative', className)}>
            <span className={cn(
                'w-2 h-2 rounded-full',
                status === 'success' && 'bg-success',
                status === 'error' && 'bg-error',
                status === 'running' && 'bg-fg-secondary',
                status === 'pending' && 'bg-fg-muted'
            )} />
            {status === 'running' && (
                <span className="absolute inset-0 w-2 h-2 rounded-full bg-fg-secondary animate-ping" />
            )}
        </span>
    );
}
