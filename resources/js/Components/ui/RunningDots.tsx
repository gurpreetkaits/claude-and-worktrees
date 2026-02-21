interface RunningDotsProps {
    size?: 'sm' | 'md';
}

export function RunningDots({ size = 'md' }: RunningDotsProps) {
    const dotClass = size === 'sm'
        ? 'w-1 h-1 rounded-full bg-fg'
        : 'size-dot rounded-full bg-fg';
    const gapClass = size === 'sm' ? 'gap-[1px]' : 'gap-[2px]';

    return (
        <div className={`flex items-center ${gapClass} shrink-0`}>
            <span className={`${dotClass} animate-running-dot-1`} />
            <span className={`${dotClass} animate-running-dot-2`} />
            <span className={`${dotClass} animate-running-dot-3`} />
        </div>
    );
}
