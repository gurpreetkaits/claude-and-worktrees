import { useEffect, useState, useCallback, useRef } from 'react';
import { Todo } from '@/types';
import { useRunningSessions, useConcurrentSessions, SessionState } from '@/hooks/useConcurrentSessions';
import { StopIcon, PlayIcon, ChevronDownIcon, ChevronUpIcon } from './ui/Icons';

interface RunningTasksPanelProps {
    todos: Todo[];
    onSelectTask: (todoId: number) => void;
    currentTodoId?: number;
}

interface TaskPreview {
    todoId: number;
    todo: Todo | undefined;
    session: SessionState;
    startTime: number;
}

function getToolActivity(tool: string, input: Record<string, unknown>): string {
    switch (tool) {
        case 'Read': return `Reading ${(input.file_path as string)?.split('/').pop() || 'file'}`;
        case 'Write': return `Writing ${(input.file_path as string)?.split('/').pop() || 'file'}`;
        case 'Edit': return `Editing ${(input.file_path as string)?.split('/').pop() || 'file'}`;
        case 'Bash': return `Running command`;
        case 'Glob': return `Searching files`;
        case 'Grep': return `Searching content`;
        case 'WebFetch': return `Fetching URL`;
        case 'WebSearch': return `Searching web`;
        case 'Task': return `Running subtask`;
        default: return `Using ${tool}`;
    }
}

export function RunningTasksPanel({ todos, onSelectTask, currentTodoId }: RunningTasksPanelProps) {
    const runningSessions = useRunningSessions();
    const { getSession, cancel } = useConcurrentSessions();
    const [expanded, setExpanded] = useState(true);
    const [taskPreviews, setTaskPreviews] = useState<TaskPreview[]>([]);
    const [currentTime, setCurrentTime] = useState(Date.now());
    const startTimesRef = useRef<Map<number, number>>(new Map());

    useEffect(() => {
        const updatePreviews = () => {
            const now = Date.now();
            runningSessions.forEach(todoId => {
                if (!startTimesRef.current.has(todoId)) startTimesRef.current.set(todoId, now);
            });
            Array.from(startTimesRef.current.keys()).forEach(todoId => {
                if (!runningSessions.includes(todoId)) startTimesRef.current.delete(todoId);
            });
            setTaskPreviews(runningSessions.map(todoId => ({
                todoId,
                todo: todos.find(t => t.id === todoId),
                session: getSession(todoId),
                startTime: startTimesRef.current.get(todoId) || now,
            })));
        };

        updatePreviews();
        if (runningSessions.length > 0) {
            const interval = setInterval(updatePreviews, 500);
            return () => clearInterval(interval);
        }
    }, [runningSessions, todos, getSession]);

    useEffect(() => {
        if (runningSessions.length === 0) return;
        const interval = setInterval(() => setCurrentTime(Date.now()), 1000);
        return () => clearInterval(interval);
    }, [runningSessions.length]);

    const handleStop = useCallback((e: React.MouseEvent, todoId: number) => {
        e.stopPropagation();
        cancel(todoId);
    }, [cancel]);

    if (runningSessions.length === 0) return null;

    return (
        <div className="border-b border-border bg-bg">
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full px-4 py-1.5 flex items-center justify-between text-[11px] font-medium text-fg-muted bg-bg-secondary cursor-pointer hover:bg-bg-muted border-b border-border"
            >
                <span>{runningSessions.length} Task{runningSessions.length > 1 ? 's' : ''} Running</span>
                {expanded ? <ChevronUpIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />}
            </button>

            {expanded && (
                <div>
                    {taskPreviews.map(({ todoId, todo, session, startTime }, index) => {
                        const durationSec = Math.floor((currentTime - startTime) / 1000);
                        const minutes = Math.floor(durationSec / 60);
                        const seconds = durationSec % 60;
                        const durationStr = `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
                        const latestTool = session.toolUses[session.toolUses.length - 1];
                        const activity = latestTool ? getToolActivity(latestTool.tool, latestTool.input) : null;

                        const toolCounts: Record<string, number> = {};
                        session.toolUses.forEach(t => { toolCounts[t.tool] = (toolCounts[t.tool] || 0) + 1; });

                        return (
                            <div
                                key={todoId}
                                onClick={() => onSelectTask(todoId)}
                                className={`px-4 py-2.5 flex items-start gap-3 hover:bg-bg-muted transition-colors cursor-pointer ${
                                    index < taskPreviews.length - 1 ? 'border-b border-border' : ''
                                }`}
                            >
                                <div className="mt-0.5">
                                    <div className="w-3.5 h-3.5 border-[1.5px] border-border rounded-full border-t-fg animate-spin" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between">
                                        <span className="text-xs font-medium text-fg truncate">{todo?.title || `Task #${todoId}`}</span>
                                        <span className="text-[10px] text-fg-muted font-mono ml-2 shrink-0">{durationStr}</span>
                                    </div>
                                    {activity && <div className="mt-0.5 text-[11px] text-fg-secondary font-medium">{activity}</div>}
                                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                        {todo?.model && (
                                            <span className="text-[10px] font-medium tracking-wider text-fg-muted uppercase bg-bg-muted px-1.5 py-0.5 rounded">
                                                {todo.model}
                                            </span>
                                        )}
                                        {session.toolUses.length > 0 && (
                                            <span className="text-[10px] text-fg-muted">
                                                {Object.entries(toolCounts).map(([name, count]) => count > 1 ? `${count}x ${name}` : name).join(', ')}
                                            </span>
                                        )}
                                        {session.costUsd !== null && session.costUsd > 0 && (
                                            <span className="text-[10px] text-fg-muted">${session.costUsd.toFixed(4)}</span>
                                        )}
                                    </div>
                                    {session.currentText && (
                                        <div className="mt-1 font-mono text-[10px] text-fg-muted pl-2 border-l border-border line-clamp-2">
                                            {getLastLines(session.currentText, 1)}
                                        </div>
                                    )}
                                    {session.queuedMessages.length > 0 && (
                                        <div className="mt-0.5 text-[10px] text-fg-muted">
                                            +{session.queuedMessages.length} queued
                                        </div>
                                    )}
                                </div>
                                <button
                                    onClick={(e) => handleStop(e, todoId)}
                                    className="p-1 text-error bg-error/10 rounded-md hover:bg-error/15 transition-colors"
                                    title="Stop"
                                >
                                    <StopIcon className="w-3 h-3" />
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function getLastLines(text: string, n: number): string {
    return text.trim().split('\n').slice(-n).join('\n');
}
