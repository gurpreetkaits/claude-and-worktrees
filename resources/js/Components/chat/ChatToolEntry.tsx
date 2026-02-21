import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
    TerminalIcon, FileIcon, SearchIcon, EditIcon, GlobeIcon,
    ChevronDownIcon, CheckIcon, AlertIcon, FolderIcon
} from '../ui/Icons';
import { StatusDot } from './ChatEntryContainer';

const toolIcons: Record<string, typeof TerminalIcon> = {
    Bash: TerminalIcon, Read: FileIcon, Write: EditIcon, Edit: EditIcon,
    Glob: FolderIcon, Grep: SearchIcon, WebFetch: GlobeIcon, WebSearch: GlobeIcon, Task: TerminalIcon,
};

interface ToolInput {
    command?: string;
    file_path?: string;
    pattern?: string;
    query?: string;
    url?: string;
    prompt?: string;
    [key: string]: unknown;
}

interface ChatToolEntryProps {
    id: string;
    tool: string;
    input: ToolInput;
    result?: { content: string; is_error: boolean };
    className?: string;
}

export function ChatToolEntry({ id, tool, input, result, className }: ChatToolEntryProps) {
    const [expanded, setExpanded] = useState(false);

    const Icon = toolIcons[tool] || TerminalIcon;
    const isComplete = result !== undefined;
    const isError = result?.is_error ?? false;
    const status: 'running' | 'success' | 'error' = isComplete ? (isError ? 'error' : 'success') : 'running';

    const getSummary = () => {
        if (input.command) {
            const cmd = input.command;
            return cmd.length > 60 ? cmd.slice(0, 60) + '...' : cmd;
        }
        if (input.file_path) return input.file_path.split('/').pop() || input.file_path;
        if (input.pattern) return `Pattern: ${input.pattern}`;
        if (input.query) return input.query.length > 40 ? input.query.slice(0, 40) + '...' : input.query;
        if (input.url) { try { return new URL(input.url).hostname; } catch { return input.url; } }
        return tool;
    };

    return (
        <div className={cn('rounded-md border overflow-hidden', isError ? 'border-error/30 bg-error/5' : 'border-border', className)}>
            <div
                className={cn(
                    'flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors',
                    isError ? 'bg-error/5 hover:bg-error/10' : 'bg-bg-secondary hover:bg-bg-muted'
                )}
                onClick={() => setExpanded(!expanded)}
            >
                <span className="relative flex-shrink-0">
                    <Icon className={cn('w-3.5 h-3.5', isError ? 'text-error' : 'text-fg-muted')} />
                    <StatusDot status={status} className="absolute -bottom-0.5 -right-0.5" />
                </span>
                <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium text-fg">{tool}</span>
                    <span className="text-[11px] text-fg-muted ml-2 truncate">{getSummary()}</span>
                </div>
                {isComplete && (
                    <span className="flex-shrink-0">
                        {isError ? <AlertIcon className="w-3.5 h-3.5 text-error" /> : <CheckIcon className="w-3.5 h-3.5 text-success" />}
                    </span>
                )}
                <ChevronDownIcon className={cn('w-3.5 h-3.5 text-fg-muted transition-transform flex-shrink-0', !expanded && '-rotate-90')} />
            </div>

            {expanded && (
                <div className="border-t border-border">
                    <div className="px-3 py-2 bg-bg-secondary">
                        <div className="text-[10px] font-medium text-fg-muted mb-1">Input</div>
                        <pre className="text-[11px] text-fg-secondary font-mono whitespace-pre-wrap break-all max-h-32 overflow-auto">
                            {JSON.stringify(input, null, 2)}
                        </pre>
                    </div>
                    {result && (
                        <div className="px-3 py-2 border-t border-border">
                            <div className="text-[10px] font-medium text-fg-muted mb-1">{isError ? 'Error' : 'Result'}</div>
                            <pre className={cn('text-[11px] font-mono whitespace-pre-wrap break-all max-h-48 overflow-auto', isError ? 'text-error' : 'text-fg-secondary')}>
                                {result.content.length > 2000 ? result.content.slice(0, 2000) + '\n... (truncated)' : result.content}
                            </pre>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// Aggregated tool summary
interface ChatToolSummaryProps {
    tools: Array<{ id: string; tool: string; input: ToolInput; result?: { content: string; is_error: boolean } }>;
    onExpand?: () => void;
    className?: string;
}

export function ChatToolSummary({ tools, onExpand, className }: ChatToolSummaryProps) {
    const completedCount = tools.filter(t => t.result && !t.result.is_error).length;
    const errorCount = tools.filter(t => t.result?.is_error).length;
    const runningCount = tools.filter(t => !t.result).length;

    const toolCounts: Record<string, number> = {};
    tools.forEach(t => { toolCounts[t.tool] = (toolCounts[t.tool] || 0) + 1; });

    return (
        <div
            className={cn('flex items-center gap-2 px-3 py-2 bg-bg-secondary rounded-md border border-border cursor-pointer hover:bg-bg-muted transition-colors', className)}
            onClick={onExpand}
        >
            <TerminalIcon className="w-3.5 h-3.5 text-fg-muted flex-shrink-0" />
            <div className="flex-1 flex items-center gap-2 min-w-0">
                <span className="text-xs text-fg-secondary">{tools.length} tool{tools.length > 1 ? 's' : ''}</span>
                <span className="text-[11px] text-fg-muted">
                    {Object.entries(toolCounts).map(([name, count]) => count > 1 ? `${count}x ${name}` : name).join(', ')}
                </span>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
                {completedCount > 0 && <span className="flex items-center gap-0.5 text-[11px] text-success"><CheckIcon className="w-3 h-3" />{completedCount}</span>}
                {errorCount > 0 && <span className="flex items-center gap-0.5 text-[11px] text-error"><AlertIcon className="w-3 h-3" />{errorCount}</span>}
                {runningCount > 0 && <span className="flex items-center gap-0.5 text-[11px] text-fg-muted"><span className="w-2 h-2 border border-border border-t-fg-muted rounded-full animate-spin" />{runningCount}</span>}
            </div>
            <ChevronDownIcon className="w-3.5 h-3.5 text-fg-muted -rotate-90" />
        </div>
    );
}
