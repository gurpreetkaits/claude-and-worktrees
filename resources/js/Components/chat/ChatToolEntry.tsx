import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
    TerminalIcon,
    FileIcon,
    SearchIcon,
    EditIcon,
    GlobeIcon,
    ChevronDownIcon,
    CheckIcon,
    AlertIcon,
    FolderIcon
} from '../ui/Icons';
import { StatusDot } from './ChatEntryContainer';

// Tool type to icon mapping
const toolIcons: Record<string, typeof TerminalIcon> = {
    Bash: TerminalIcon,
    Read: FileIcon,
    Write: EditIcon,
    Edit: EditIcon,
    Glob: FolderIcon,
    Grep: SearchIcon,
    WebFetch: GlobeIcon,
    WebSearch: GlobeIcon,
    Task: TerminalIcon,
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
    result?: {
        content: string;
        is_error: boolean;
    };
    className?: string;
}

export function ChatToolEntry({ id, tool, input, result, className }: ChatToolEntryProps) {
    const [expanded, setExpanded] = useState(false);

    const Icon = toolIcons[tool] || TerminalIcon;
    const isComplete = result !== undefined;
    const isError = result?.is_error ?? false;
    const status: 'running' | 'success' | 'error' = isComplete
        ? (isError ? 'error' : 'success')
        : 'running';

    // Get a summary of the tool input
    const getSummary = () => {
        if (input.command) {
            const cmd = input.command;
            return cmd.length > 60 ? cmd.slice(0, 60) + '...' : cmd;
        }
        if (input.file_path) {
            return input.file_path.split('/').pop() || input.file_path;
        }
        if (input.pattern) {
            return `Pattern: ${input.pattern}`;
        }
        if (input.query) {
            return input.query.length > 40 ? input.query.slice(0, 40) + '...' : input.query;
        }
        if (input.url) {
            try {
                return new URL(input.url).hostname;
            } catch {
                return input.url;
            }
        }
        return tool;
    };

    return (
        <div
            className={cn(
                'rounded-lg border overflow-hidden',
                isError ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20' : 'border-gray-200 dark:border-gray-700',
                className
            )}
        >
            {/* Header */}
            <div
                className={cn(
                    'flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors',
                    isError ? 'bg-red-100 dark:bg-red-900/30 hover:bg-red-150 dark:hover:bg-red-900/40' : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'
                )}
                onClick={() => setExpanded(!expanded)}
            >
                <span className="relative flex-shrink-0">
                    <Icon className={cn('w-4 h-4', isError ? 'text-red-500 dark:text-red-400' : 'text-gray-500 dark:text-gray-400')} />
                    <StatusDot status={status} className="absolute -bottom-0.5 -right-0.5" />
                </span>

                <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{tool}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 ml-2 truncate">
                        {getSummary()}
                    </span>
                </div>

                {isComplete && (
                    <span className="flex-shrink-0">
                        {isError ? (
                            <AlertIcon className="w-4 h-4 text-red-500 dark:text-red-400" />
                        ) : (
                            <CheckIcon className="w-4 h-4 text-green-500 dark:text-green-400" />
                        )}
                    </span>
                )}

                <ChevronDownIcon
                    className={cn(
                        'w-4 h-4 text-gray-500 dark:text-gray-400 transition-transform flex-shrink-0',
                        !expanded && '-rotate-90'
                    )}
                />
            </div>

            {/* Content */}
            {expanded && (
                <div className="border-t border-gray-200 dark:border-gray-700">
                    {/* Input */}
                    <div className="px-3 py-2 bg-gray-100/50 dark:bg-gray-700/50">
                        <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Input</div>
                        <pre className="text-xs text-gray-700 dark:text-gray-300 font-mono whitespace-pre-wrap break-all max-h-32 overflow-auto">
                            {JSON.stringify(input, null, 2)}
                        </pre>
                    </div>

                    {/* Result */}
                    {result && (
                        <div className="px-3 py-2">
                            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                                {isError ? 'Error' : 'Result'}
                            </div>
                            <pre className={cn(
                                'text-xs font-mono whitespace-pre-wrap break-all max-h-48 overflow-auto',
                                isError ? 'text-red-500 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'
                            )}>
                                {result.content.length > 2000
                                    ? result.content.slice(0, 2000) + '\n... (truncated)'
                                    : result.content}
                            </pre>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// Aggregated tool entries for collapsed view
interface ChatToolSummaryProps {
    tools: Array<{
        id: string;
        tool: string;
        input: ToolInput;
        result?: { content: string; is_error: boolean };
    }>;
    onExpand?: () => void;
    className?: string;
}

export function ChatToolSummary({ tools, onExpand, className }: ChatToolSummaryProps) {
    const completedCount = tools.filter(t => t.result && !t.result.is_error).length;
    const errorCount = tools.filter(t => t.result?.is_error).length;
    const runningCount = tools.filter(t => !t.result).length;

    // Group by tool type
    const toolCounts: Record<string, number> = {};
    tools.forEach(t => {
        toolCounts[t.tool] = (toolCounts[t.tool] || 0) + 1;
    });

    return (
        <div
            className={cn(
                'flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors',
                className
            )}
            onClick={onExpand}
        >
            <TerminalIcon className="w-4 h-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />

            <div className="flex-1 flex items-center gap-2 min-w-0">
                <span className="text-sm text-gray-700 dark:text-gray-300">
                    {tools.length} tool{tools.length > 1 ? 's' : ''}
                </span>

                <span className="text-xs text-gray-500 dark:text-gray-400">
                    {Object.entries(toolCounts).map(([name, count]) =>
                        count > 1 ? `${count}× ${name}` : name
                    ).join(', ')}
                </span>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
                {completedCount > 0 && (
                    <span className="flex items-center gap-0.5 text-xs text-green-500 dark:text-green-400">
                        <CheckIcon className="w-3 h-3" />
                        {completedCount}
                    </span>
                )}
                {errorCount > 0 && (
                    <span className="flex items-center gap-0.5 text-xs text-red-500 dark:text-red-400">
                        <AlertIcon className="w-3 h-3" />
                        {errorCount}
                    </span>
                )}
                {runningCount > 0 && (
                    <span className="flex items-center gap-0.5 text-xs text-gray-600 dark:text-gray-400">
                        <span className="w-2 h-2 border border-gray-300 dark:border-gray-600 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin" />
                        {runningCount}
                    </span>
                )}
            </div>

            <ChevronDownIcon className="w-4 h-4 text-gray-500 dark:text-gray-400 -rotate-90" />
        </div>
    );
}
