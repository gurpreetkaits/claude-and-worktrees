import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { ReactNode } from 'react';

interface ResizablePanelProps {
    left: ReactNode;
    center: ReactNode;
    right: ReactNode;
    leftMinSize?: number;
    rightMinSize?: number;
    defaultLeftSize?: number;
    defaultRightSize?: number;
    centerMinSize?: number;
}

export function ThreePanelLayout({
    left, center, right,
    leftMinSize = 15, rightMinSize = 15,
    defaultLeftSize = 18, defaultRightSize = 22, centerMinSize = 35,
}: ResizablePanelProps) {
    return (
        <PanelGroup direction="horizontal" className="h-screen">
            <Panel defaultSize={defaultLeftSize} minSize={leftMinSize} maxSize={30}>
                <div className="h-full overflow-hidden">{left}</div>
            </Panel>
            <PanelResizeHandle className="w-px bg-border hover:bg-fg-muted transition-colors cursor-col-resize" />
            <Panel minSize={centerMinSize}>
                <div className="h-full overflow-hidden">{center}</div>
            </Panel>
            <PanelResizeHandle className="w-px bg-border hover:bg-fg-muted transition-colors cursor-col-resize" />
            <Panel defaultSize={defaultRightSize} minSize={rightMinSize} maxSize={35}>
                <div className="h-full overflow-hidden">{right}</div>
            </Panel>
        </PanelGroup>
    );
}

interface TwoPanelLayoutProps {
    left: ReactNode;
    right: ReactNode;
    leftMinSize?: number;
    rightMinSize?: number;
    defaultLeftSize?: number;
}

export function TwoPanelLayout({
    left, right, leftMinSize = 15, rightMinSize = 40, defaultLeftSize = 20,
}: TwoPanelLayoutProps) {
    return (
        <PanelGroup direction="horizontal" className="h-screen">
            <Panel defaultSize={defaultLeftSize} minSize={leftMinSize} maxSize={35}>
                <div className="h-full overflow-hidden">{left}</div>
            </Panel>
            <PanelResizeHandle className="w-px bg-border hover:bg-fg-muted transition-colors cursor-col-resize" />
            <Panel minSize={rightMinSize}>
                <div className="h-full overflow-hidden">{right}</div>
            </Panel>
        </PanelGroup>
    );
}
