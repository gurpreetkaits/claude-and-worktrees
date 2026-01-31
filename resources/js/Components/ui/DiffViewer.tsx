import { useMemo } from 'react';

interface DiffViewerProps {
    diff: string;
    fileName?: string;
    compact?: boolean;
}

interface DiffLine {
    type: 'header' | 'add' | 'remove' | 'context' | 'info';
    content: string;
    oldLineNum?: number;
    newLineNum?: number;
}

interface DiffHunk {
    header: string;
    oldStart: number;
    newStart: number;
    lines: DiffLine[];
}

export function DiffViewer({ diff, fileName, compact = false }: DiffViewerProps) {
    const hunks = useMemo(() => {
        if (!diff) return [];

        const parsedHunks: DiffHunk[] = [];
        const rawLines = diff.split('\n');

        let currentHunk: DiffHunk | null = null;
        let oldLine = 0;
        let newLine = 0;

        rawLines.forEach((line) => {
            // Skip file headers
            if (line.startsWith('diff --git') || line.startsWith('index ') ||
                line.startsWith('---') || line.startsWith('+++') || line.startsWith('\\')) {
                return;
            }

            // Parse hunk header: @@ -oldStart,oldCount +newStart,newCount @@
            if (line.startsWith('@@')) {
                const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
                if (match) {
                    currentHunk = {
                        header: line,
                        oldStart: parseInt(match[1], 10),
                        newStart: parseInt(match[2], 10),
                        lines: [],
                    };
                    oldLine = currentHunk.oldStart;
                    newLine = currentHunk.newStart;
                    parsedHunks.push(currentHunk);
                }
                return;
            }

            if (!currentHunk) return;

            if (line.startsWith('+')) {
                currentHunk.lines.push({
                    type: 'add',
                    content: line.slice(1),
                    newLineNum: newLine++,
                });
            } else if (line.startsWith('-')) {
                currentHunk.lines.push({
                    type: 'remove',
                    content: line.slice(1),
                    oldLineNum: oldLine++,
                });
            } else {
                currentHunk.lines.push({
                    type: 'context',
                    content: line.startsWith(' ') ? line.slice(1) : line,
                    oldLineNum: oldLine++,
                    newLineNum: newLine++,
                });
            }
        });

        return parsedHunks;
    }, [diff]);

    // Calculate stats
    const stats = useMemo(() => {
        let additions = 0;
        let deletions = 0;
        hunks.forEach(hunk => {
            hunk.lines.forEach(line => {
                if (line.type === 'add') additions++;
                if (line.type === 'remove') deletions++;
            });
        });
        return { additions, deletions };
    }, [hunks]);

    if (!diff || hunks.length === 0) {
        return (
            <div className="text-center text-text-low py-4 text-xs">
                No changes to display
            </div>
        );
    }

    return (
        <div className="font-mono text-xs overflow-x-auto">
            {/* File header with stats */}
            {fileName && (
                <div className="flex items-center justify-between px-3 py-1.5 bg-bg-panel border-b border-border">
                    <span className="text-text-high truncate">{fileName}</span>
                    <div className="flex items-center gap-2 text-xs flex-shrink-0 ml-2">
                        {stats.additions > 0 && (
                            <span className="text-success">+{stats.additions}</span>
                        )}
                        {stats.deletions > 0 && (
                            <span className="text-error">-{stats.deletions}</span>
                        )}
                    </div>
                </div>
            )}

            {/* Diff content */}
            <div className="bg-bg-secondary">
                {hunks.map((hunk, hunkIndex) => (
                    <div key={hunkIndex}>
                        {/* Hunk separator - show context info */}
                        {!compact && (
                            <div className="px-3 py-1 bg-brand/5 text-brand text-[10px] border-y border-border/50">
                                {hunk.header.replace(/@@ .* @@/, '').trim() || `Lines ${hunk.oldStart}-${hunk.oldStart + hunk.lines.filter(l => l.type !== 'add').length}`}
                            </div>
                        )}

                        {/* Lines */}
                        {hunk.lines.map((line, lineIndex) => (
                            <div
                                key={lineIndex}
                                className={`flex ${getLineClass(line.type)}`}
                            >
                                {/* Line numbers */}
                                <div className="flex-shrink-0 flex select-none border-r border-border/30">
                                    <span className={`w-8 px-1 text-right ${
                                        line.type === 'add' ? 'bg-success/5' :
                                        line.type === 'remove' ? 'bg-error/5' : 'bg-transparent'
                                    } text-text-low/50`}>
                                        {line.oldLineNum ?? ''}
                                    </span>
                                    <span className={`w-8 px-1 text-right ${
                                        line.type === 'add' ? 'bg-success/5' :
                                        line.type === 'remove' ? 'bg-error/5' : 'bg-transparent'
                                    } text-text-low/50`}>
                                        {line.newLineNum ?? ''}
                                    </span>
                                </div>

                                {/* Sign indicator */}
                                <span className={`w-5 flex-shrink-0 text-center select-none ${
                                    line.type === 'add' ? 'text-success bg-success/10' :
                                    line.type === 'remove' ? 'text-error bg-error/10' : 'text-transparent'
                                }`}>
                                    {line.type === 'add' ? '+' : line.type === 'remove' ? '−' : ' '}
                                </span>

                                {/* Content */}
                                <span className={`flex-1 px-2 py-px whitespace-pre overflow-hidden ${
                                    line.type === 'add' ? 'bg-success/10 text-text-high' :
                                    line.type === 'remove' ? 'bg-error/10 text-text-high' : 'text-text-normal'
                                }`}>
                                    {line.content || ' '}
                                </span>
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}

function getLineClass(type: DiffLine['type']): string {
    switch (type) {
        case 'add':
            return 'hover:bg-success/20';
        case 'remove':
            return 'hover:bg-error/20';
        default:
            return 'hover:bg-bg-panel/50';
    }
}
