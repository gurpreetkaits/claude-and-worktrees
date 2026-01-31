import { useState, useMemo } from 'react';
import { RunningDots } from './ui/RunningDots';
import {
    ChevronDownIcon,
    ChevronRightIcon,
    CheckIcon,
    XIcon,
    FolderIcon,
    EditIcon,
    SearchIcon,
    TerminalIcon,
    BrainIcon,
    GlobeIcon,
    CodeIcon,
    ShieldIcon,
} from './ui/Icons';
import { Markdown } from './ui/Markdown';

interface ToolUse {
    id: string | null;
    tool: string;
    input: Record<string, unknown>;
    status?: 'running' | 'success' | 'error';
    result?: string;
}

interface ToolResult {
    tool_use_id: string | null;
    content: string;
    is_error: boolean;
}

interface BlockedCommand {
    tool: string;
    reason: string;
    timestamp: number;
}

interface StreamingMessageProps {
    content: string;
    isStreaming?: boolean;
    toolUses?: ToolUse[];
    toolResults?: ToolResult[];
    thinking?: string;
    blockedCommands?: BlockedCommand[];
}

const toolConfig: Record<string, { icon: typeof FolderIcon; label: string; color: string }> = {
    Read: { icon: FolderIcon, label: 'Read', color: 'text-info' },
    Write: { icon: EditIcon, label: 'Write', color: 'text-success' },
    Edit: { icon: EditIcon, label: 'Edit', color: 'text-warning' },
    Glob: { icon: SearchIcon, label: 'Find', color: 'text-purple-500' },
    Grep: { icon: SearchIcon, label: 'Search', color: 'text-purple-500' },
    Bash: { icon: TerminalIcon, label: 'Run', color: 'text-brand' },
    Task: { icon: CodeIcon, label: 'Task', color: 'text-cyan-500' },
    WebFetch: { icon: GlobeIcon, label: 'Fetch', color: 'text-blue-500' },
    WebSearch: { icon: GlobeIcon, label: 'Search Web', color: 'text-blue-500' },
};

function getToolInfo(toolName: string) {
    return toolConfig[toolName] || { icon: TerminalIcon, label: toolName, color: 'text-text-low' };
}

function getToolSummary(tool: ToolUse): string {
    const { tool: toolName, input } = tool;

    switch (toolName) {
        case 'Read':
            if (input.file_path) {
                const path = String(input.file_path);
                return path.split('/').pop() || path;
            }
            return 'file';
        case 'Write':
        case 'Edit':
            if (input.file_path) {
                const path = String(input.file_path);
                return path.split('/').pop() || path;
            }
            return 'file';
        case 'Glob':
            return input.pattern ? String(input.pattern) : 'files';
        case 'Grep':
            return input.pattern ? `"${input.pattern}"` : 'pattern';
        case 'Bash':
            if (input.command) {
                const cmd = String(input.command);
                return cmd.length > 50 ? cmd.slice(0, 50) + '...' : cmd;
            }
            return 'command';
        case 'Task':
            return input.description ? String(input.description) : 'subagent';
        case 'WebFetch':
            return input.url ? String(input.url) : 'URL';
        case 'WebSearch':
            return input.query ? String(input.query) : 'query';
        default:
            return toolName;
    }
}

function ToolStatusDot({ status }: { status: 'running' | 'success' | 'error' }) {
    if (status === 'running') {
        return (
            <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-brand" />
            </span>
        );
    }
    if (status === 'error') {
        return (
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-error" />
        );
    }
    return (
        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-success" />
    );
}

function ToolEntry({ tool, isLast }: { tool: ToolUse & { status: 'running' | 'success' | 'error' }; isLast: boolean }) {
    const [expanded, setExpanded] = useState(false);
    const info = getToolInfo(tool.tool);
    const Icon = info.icon;
    const summary = getToolSummary(tool);
    const hasResult = tool.result && tool.result.trim().length > 0;

    return (
        <div className="group">
            <div
                className={`flex items-center gap-2 py-1.5 px-2 rounded-md transition-colors ${
                    hasResult ? 'cursor-pointer hover:bg-bg-panel' : ''
                }`}
                onClick={() => hasResult && setExpanded(!expanded)}
            >
                <span className="relative flex-shrink-0">
                    <Icon className={`w-4 h-4 ${info.color}`} />
                    <ToolStatusDot status={tool.status} />
                </span>

                <span className="flex-1 min-w-0 text-sm">
                    <span className="text-text-low">{info.label}</span>
                    <span className="ml-1.5 text-text-normal truncate">{summary}</span>
                </span>

                {hasResult && (
                    <span className="text-text-low opacity-0 group-hover:opacity-100 transition-opacity">
                        {expanded ? (
                            <ChevronDownIcon className="w-3 h-3" />
                        ) : (
                            <ChevronRightIcon className="w-3 h-3" />
                        )}
                    </span>
                )}
            </div>

            {expanded && hasResult && (
                <div className="ml-6 mt-1 mb-2 p-2 bg-console-bg rounded text-xs font-mono text-console-fg max-h-48 overflow-auto">
                    <pre className="whitespace-pre-wrap break-words">{tool.result}</pre>
                </div>
            )}
        </div>
    );
}

function ThinkingIndicator({ thinking, isStreaming }: { thinking: string; isStreaming: boolean }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="flex items-start gap-2 text-text-low">
            <BrainIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="flex items-center gap-1 text-sm hover:text-text-normal transition-colors"
                >
                    <span className="opacity-70">Thinking</span>
                    {isStreaming && <RunningDots size="sm" />}
                    {expanded ? (
                        <ChevronDownIcon className="w-3 h-3 ml-1" />
                    ) : (
                        <ChevronRightIcon className="w-3 h-3 ml-1" />
                    )}
                </button>
                {expanded && (
                    <div className="mt-2 text-sm opacity-70 italic">
                        <Markdown content={thinking.slice(0, 1000) + (thinking.length > 1000 ? '...' : '')} />
                    </div>
                )}
            </div>
        </div>
    );
}

export function StreamingMessage({
    content,
    isStreaming = true,
    toolUses = [],
    toolResults = [],
    thinking = '',
    blockedCommands = [],
}: StreamingMessageProps) {
    const hasContent = content.trim().length > 0;
    const hasTools = toolUses.length > 0;
    const hasThinking = thinking.trim().length > 0;
    const hasBlockedCommands = blockedCommands.length > 0;

    const toolsWithStatus = useMemo(() => {
        return toolUses.map(tool => {
            const result = toolResults.find(r => r.tool_use_id === tool.id);
            return {
                ...tool,
                status: result
                    ? (result.is_error ? 'error' : 'success')
                    : (isStreaming ? 'running' : 'success'),
                result: result?.content,
            } as ToolUse & { status: 'running' | 'success' | 'error' };
        });
    }, [toolUses, toolResults, isStreaming]);

    const activeTool = useMemo(() => {
        if (!isStreaming) return null;
        const runningTools = toolsWithStatus.filter(t => t.status === 'running');
        return runningTools[runningTools.length - 1] || null;
    }, [toolsWithStatus, isStreaming]);

    const groupedTools = useMemo(() => {
        const groups: { type: string; tools: typeof toolsWithStatus }[] = [];
        let currentGroup: typeof toolsWithStatus = [];
        let currentType = '';

        for (const tool of toolsWithStatus) {
            if (tool.tool === currentType) {
                currentGroup.push(tool);
            } else {
                if (currentGroup.length > 0) {
                    groups.push({ type: currentType, tools: currentGroup });
                }
                currentGroup = [tool];
                currentType = tool.tool;
            }
        }
        if (currentGroup.length > 0) {
            groups.push({ type: currentType, tools: currentGroup });
        }
        return groups;
    }, [toolsWithStatus]);

    return (
        <div className="space-y-4">
            {hasThinking && (
                <ThinkingIndicator thinking={thinking} isStreaming={isStreaming && !hasContent} />
            )}

            {isStreaming && activeTool && !hasContent && (
                <div className="flex items-center gap-3 px-4 py-3 bg-bg-panel rounded-lg border border-brand/20">
                    <span className="relative">
                        {(() => {
                            const info = getToolInfo(activeTool.tool);
                            const Icon = info.icon;
                            return <Icon className={`w-5 h-5 ${info.color}`} />;
                        })()}
                        <ToolStatusDot status="running" />
                    </span>
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-text-high">
                            {getToolInfo(activeTool.tool).label}: {getToolSummary(activeTool)}
                        </div>
                    </div>
                    <RunningDots />
                </div>
            )}

            {!hasContent && isStreaming && !activeTool && !hasThinking && (
                <div className="flex items-center gap-3 text-text-low">
                    <RunningDots />
                    <span className="text-sm">Starting...</span>
                </div>
            )}

            {hasContent && (
                <div className="text-sm">
                    <Markdown content={content} />
                    {isStreaming && (
                        <span className="inline-block w-2 h-4 ml-0.5 bg-brand animate-cursor-blink rounded-sm" />
                    )}
                </div>
            )}

            {hasTools && toolsWithStatus.length > 0 && (
                <div className="border-t border-border pt-3 mt-3">
                    <div className="text-xs text-text-low mb-2 flex items-center gap-2">
                        <span>{toolsWithStatus.length} tool{toolsWithStatus.length > 1 ? 's' : ''} used</span>
                        {toolsWithStatus.filter(t => t.status === 'running').length > 0 && (
                            <RunningDots size="sm" />
                        )}
                    </div>
                    <div className="space-y-0.5">
                        {toolsWithStatus.map((tool, index) => (
                            <ToolEntry
                                key={tool.id || index}
                                tool={tool}
                                isLast={index === toolsWithStatus.length - 1}
                            />
                        ))}
                    </div>
                </div>
            )}

            {hasBlockedCommands && (
                <div className="border-t border-error/20 pt-3 mt-3">
                    <div className="text-xs text-error mb-2 flex items-center gap-2">
                        <ShieldIcon className="w-4 h-4" />
                        <span className="font-medium">{blockedCommands.length} dangerous command{blockedCommands.length > 1 ? 's' : ''} blocked</span>
                    </div>
                    <div className="space-y-1">
                        {blockedCommands.map((blocked, index) => (
                            <div
                                key={index}
                                className="flex items-center gap-2 px-2 py-1.5 bg-error/5 border border-error/10 rounded text-sm"
                            >
                                <span className="text-error font-medium">{blocked.tool}</span>
                                <span className="text-text-low">— {blocked.reason}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
