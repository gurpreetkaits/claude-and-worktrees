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

export function RunningTasksPanel({ todos, onSelectTask, currentTodoId }: RunningTasksPanelProps) {
    const runningSessions = useRunningSessions();
    const { getSession, cancel } = useConcurrentSessions();
    const [expanded, setExpanded] = useState(true);
    const [taskPreviews, setTaskPreviews] = useState<TaskPreview[]>([]);
    const [currentTime, setCurrentTime] = useState(Date.now());
    const startTimesRef = useRef<Map<number, number>>(new Map());

    // Update task previews when running sessions change
    useEffect(() => {
        const updatePreviews = () => {
            const now = Date.now();

            // Track start times for new tasks
            runningSessions.forEach(todoId => {
                if (!startTimesRef.current.has(todoId)) {
                    startTimesRef.current.set(todoId, now);
                }
            });

            // Clean up finished tasks
            Array.from(startTimesRef.current.keys()).forEach(todoId => {
                if (!runningSessions.includes(todoId)) {
                    startTimesRef.current.delete(todoId);
                }
            });

            const previews = runningSessions.map(todoId => ({
                todoId,
                todo: todos.find(t => t.id === todoId),
                session: getSession(todoId),
                startTime: startTimesRef.current.get(todoId) || now,
            }));
            setTaskPreviews(previews);
        };

        updatePreviews();

        // Poll for updates while tasks are running
        if (runningSessions.length > 0) {
            const interval = setInterval(updatePreviews, 500);
            return () => clearInterval(interval);
        }
    }, [runningSessions, todos, getSession]);

    // Update current time for duration display
    useEffect(() => {
        if (runningSessions.length === 0) return;
        const interval = setInterval(() => setCurrentTime(Date.now()), 1000);
        return () => clearInterval(interval);
    }, [runningSessions.length]);

    const handleStop = useCallback((e: React.MouseEvent, todoId: number) => {
        e.stopPropagation();
        cancel(todoId);
    }, [cancel]);

    if (runningSessions.length === 0) {
        return null;
    }

    return (
        <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
            {/* Header */}
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full px-4 py-2 flex items-center justify-between text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-50/50 dark:bg-gray-800/50 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-100 dark:border-gray-700/50"
            >
                <span>{runningSessions.length} Task{runningSessions.length > 1 ? 's' : ''} Running</span>
                {expanded ? (
                    <ChevronUpIcon className="w-3 h-3" />
                ) : (
                    <ChevronDownIcon className="w-3 h-3" />
                )}
            </button>

            {/* Running tasks list */}
            {expanded && (
                <div>
                    {taskPreviews.map(({ todoId, todo, session, startTime }, index) => {
                        const durationSec = Math.floor((currentTime - startTime) / 1000);
                        const minutes = Math.floor(durationSec / 60);
                        const seconds = durationSec % 60;
                        const durationStr = `${minutes}m ${seconds.toString().padStart(2, '0')}s`;

                        return (
                            <div
                                key={todoId}
                                onClick={() => onSelectTask(todoId)}
                                className={`px-4 py-3 flex items-start gap-3 hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer ${
                                    index < taskPreviews.length - 1 ? 'border-b border-gray-100 dark:border-gray-700/50' : ''
                                }`}
                            >
                                {/* Spinner */}
                                <div className="mt-0.5">
                                    <div className="w-4 h-4 border-2 border-gray-300 dark:border-gray-600 rounded-full border-t-transparent animate-spin" />
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    {/* Title and duration */}
                                    <div className="flex justify-between">
                                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                            {todo?.title || `Task #${todoId}`}
                                        </span>
                                        <span className="text-xs text-gray-400 dark:text-gray-500 font-mono ml-2 shrink-0">
                                            {durationStr}
                                        </span>
                                    </div>

                                    {/* Model and tools */}
                                    <div className="flex items-center gap-2 mt-1">
                                        {todo?.model && (
                                            <span className="text-[10px] font-bold tracking-wider text-gray-500 dark:text-gray-400 uppercase bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                                                {todo.model}
                                            </span>
                                        )}
                                        {session.toolUses.length > 0 && (
                                            <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                                <PlayIcon className="w-3 h-3 fill-gray-500 dark:fill-gray-400" />
                                                {session.toolUses.length} tool{session.toolUses.length > 1 ? 's' : ''}
                                            </span>
                                        )}
                                        {session.costUsd !== null && session.costUsd > 0 && (
                                            <span className="text-xs text-gray-400 dark:text-gray-500">
                                                ${session.costUsd.toFixed(4)}
                                            </span>
                                        )}
                                    </div>

                                    {/* Live preview */}
                                    {(session.currentText || session.toolUses.length > 0) && (
                                        <div className="mt-1 font-mono text-xs text-gray-500 dark:text-gray-400 pl-2 border-l-2 border-gray-200 dark:border-gray-700 line-clamp-2">
                                            {session.currentText ? getLastLines(session.currentText, 1) : ''}
                                            {session.toolUses.length > 0 && (
                                                <span className="text-gray-400 dark:text-gray-500">
                                                    {session.currentText ? ' ' : ''}{session.toolUses[session.toolUses.length - 1]?.tool}
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    {/* Queued messages */}
                                    {session.queuedMessages.length > 0 && (
                                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                            +{session.queuedMessages.length} message{session.queuedMessages.length > 1 ? 's' : ''} queued
                                        </div>
                                    )}

                                    {/* Blocked commands */}
                                    {session.blockedCommands.length > 0 && (
                                        <div className="mt-1 text-xs text-yellow-600 dark:text-yellow-400">
                                            {session.blockedCommands.length} command{session.blockedCommands.length > 1 ? 's' : ''} blocked
                                        </div>
                                    )}
                                </div>

                                {/* Stop button */}
                                <button
                                    onClick={(e) => handleStop(e, todoId)}
                                    className="p-1.5 text-red-500 bg-red-50 dark:bg-red-900/20 rounded hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                                    title="Stop this task"
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

// Helper to get last N lines of text
function getLastLines(text: string, n: number): string {
    const lines = text.trim().split('\n');
    return lines.slice(-n).join('\n');
}
