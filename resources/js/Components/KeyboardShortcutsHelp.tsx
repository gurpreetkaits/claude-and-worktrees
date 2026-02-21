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
                    {i > 0 && <span className="text-fg-muted mx-0.5">then</span>}
                    <kbd className="px-2 py-1 text-[11px] font-mono bg-bg-muted border border-border rounded min-w-[24px] text-center text-fg-secondary">
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
                <TransitionChild as={Fragment}
                    enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100"
                    leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
                </TransitionChild>

                <div className="fixed inset-0 overflow-y-auto">
                    <div className="flex min-h-full items-center justify-center p-4">
                        <TransitionChild as={Fragment}
                            enter="ease-out duration-200" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100"
                            leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95"
                        >
                            <DialogPanel className="w-full max-w-2xl transform overflow-hidden rounded-lg bg-bg border border-border shadow-2xl transition-all">
                                <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                                    <h2 className="text-base font-semibold text-fg">Keyboard Shortcuts</h2>
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        className="p-1 text-fg-muted hover:text-fg hover:bg-bg-muted rounded-md transition-colors"
                                    >
                                        <XIcon className="w-4 h-4" />
                                    </button>
                                </div>

                                <div className="p-6 grid grid-cols-2 gap-6">
                                    {shortcuts.map((section) => (
                                        <div key={section.category}>
                                            <h3 className="text-[11px] font-medium text-fg-muted uppercase tracking-wider mb-3">
                                                {section.category}
                                            </h3>
                                            <div className="space-y-2">
                                                {section.items.map((item) => (
                                                    <div key={item.key} className="flex items-center justify-between gap-4">
                                                        <span className="text-xs text-fg-secondary">{item.description}</span>
                                                        <KeyCombo keys={item.key} />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="px-6 py-3 border-t border-border bg-bg-secondary text-center text-[11px] text-fg-muted">
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
