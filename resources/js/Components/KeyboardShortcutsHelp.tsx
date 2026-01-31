import { Fragment } from 'react';
import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react';
import { XIcon } from './ui/Icons';

interface ShortcutItem {
    key: string;
    description: string;
}

interface KeyboardShortcutsHelpProps {
    show: boolean;
    onClose: () => void;
}

const shortcuts: { category: string; items: ShortcutItem[] }[] = [
    {
        category: 'Navigation',
        items: [
            { key: 'j', description: 'Next task' },
            { key: 'k', description: 'Previous task' },
            { key: '1-9', description: 'Go to task by number' },
            { key: '/', description: 'Focus message input' },
        ],
    },
    {
        category: 'Actions',
        items: [
            { key: '⌘ N', description: 'New task' },
            { key: '⌘ K', description: 'Search / Command palette' },
            { key: '⌘ ,', description: 'Settings' },
            { key: 'Esc', description: 'Cancel / Close' },
        ],
    },
    {
        category: 'Sequences (vim-style)',
        items: [
            { key: 'g n', description: 'Go to new task' },
            { key: 'g s', description: 'Go to settings' },
            { key: 'g c', description: 'Toggle changes panel' },
        ],
    },
    {
        category: 'Git',
        items: [
            { key: 'g', description: 'Toggle git changes panel' },
        ],
    },
];

function KeyCombo({ keys }: { keys: string }) {
    const parts = keys.split(' ');
    return (
        <span className="flex items-center gap-1">
            {parts.map((part, i) => (
                <Fragment key={i}>
                    {i > 0 && <span className="text-text-low mx-0.5">then</span>}
                    <kbd className="px-2 py-1 text-xs font-mono bg-bg-panel border border-border rounded shadow-sm min-w-[24px] text-center">
                        {part}
                    </kbd>
                </Fragment>
            ))}
        </span>
    );
}

export function KeyboardShortcutsHelp({ show, onClose }: KeyboardShortcutsHelpProps) {
    return (
        <Transition show={show} as={Fragment}>
            <Dialog as="div" className="relative z-50" onClose={onClose}>
                <TransitionChild
                    as={Fragment}
                    enter="ease-out duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-200"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
                </TransitionChild>

                <div className="fixed inset-0 overflow-y-auto">
                    <div className="flex min-h-full items-center justify-center p-4">
                        <TransitionChild
                            as={Fragment}
                            enter="ease-out duration-300"
                            enterFrom="opacity-0 scale-95"
                            enterTo="opacity-100 scale-100"
                            leave="ease-in duration-200"
                            leaveFrom="opacity-100 scale-100"
                            leaveTo="opacity-0 scale-95"
                        >
                            <DialogPanel className="w-full max-w-2xl transform overflow-hidden rounded-xl bg-bg-primary border border-border shadow-2xl transition-all">
                                {/* Header */}
                                <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                                    <h2 className="text-lg font-semibold text-text-high">Keyboard Shortcuts</h2>
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        className="p-1.5 text-text-low hover:text-text-high hover:bg-bg-panel rounded transition-colors"
                                    >
                                        <XIcon className="w-4 h-4" />
                                    </button>
                                </div>

                                {/* Content */}
                                <div className="p-6 grid grid-cols-2 gap-6">
                                    {shortcuts.map((section) => (
                                        <div key={section.category}>
                                            <h3 className="text-sm font-medium text-text-low uppercase tracking-wider mb-3">
                                                {section.category}
                                            </h3>
                                            <div className="space-y-2">
                                                {section.items.map((item) => (
                                                    <div
                                                        key={item.key}
                                                        className="flex items-center justify-between gap-4"
                                                    >
                                                        <span className="text-sm text-text-normal">
                                                            {item.description}
                                                        </span>
                                                        <KeyCombo keys={item.key} />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Footer */}
                                <div className="px-6 py-4 border-t border-border bg-bg-secondary/50 text-center text-sm text-text-low">
                                    Press <KeyCombo keys="?" /> anytime to show this help
                                </div>
                            </DialogPanel>
                        </TransitionChild>
                    </div>
                </div>
            </Dialog>
        </Transition>
    );
}
