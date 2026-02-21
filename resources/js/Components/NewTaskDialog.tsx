import { useState, useEffect, Fragment, useRef } from 'react';
import { router } from '@inertiajs/react';
import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react';
import { Worktree, ClaudeModel, ClaudeModelsConfig } from '@/types';
import { WorktreeSelector } from './WorktreeSelector';
import { XIcon, SparklesIcon, ChevronDownIcon, FolderIcon, GitBranchIcon } from './ui/Icons';
import axios from 'axios';

interface NewTaskDialogProps {
    show: boolean;
    worktrees: Worktree[];
    models?: ClaudeModelsConfig;
    defaultWorktree?: Worktree | null;
    defaultProjectsPath?: string;
    defaultModel?: ClaudeModel;
    defaultContext?: string;
    onClose: () => void;
    onTaskCreated?: (taskId: number) => void;
}

const defaultModels: ClaudeModelsConfig = {
    sonnet: { name: 'Claude Sonnet', description: 'Fast and efficient for most tasks', flag: '--model=sonnet' },
    opus: { name: 'Claude Opus', description: 'Most capable for complex tasks', flag: '--model=opus' },
    haiku: { name: 'Claude Haiku', description: 'Fastest for simple tasks', flag: '--model=haiku' },
};

const modelDisplayNames: Record<ClaudeModel, string> = {
    sonnet: 'Sonnet',
    opus: 'Opus',
    haiku: 'Haiku',
};

export function NewTaskDialog({
    show, worktrees, models = defaultModels, defaultWorktree,
    defaultProjectsPath, defaultModel = 'sonnet', defaultContext = '',
    onClose, onTaskCreated,
}: NewTaskDialogProps) {
    const [selectedWorktree, setSelectedWorktree] = useState<Worktree | null>(defaultWorktree || null);
    const [title, setTitle] = useState('');
    const [context, setContext] = useState(defaultContext);
    const [model, setModel] = useState<ClaudeModel>(defaultModel);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [worktreeList, setWorktreeList] = useState<Worktree[]>(worktrees);
    const [showModelDropdown, setShowModelDropdown] = useState(false);
    const modelDropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => { setWorktreeList(worktrees); }, [worktrees]);
    useEffect(() => { if (defaultWorktree) setSelectedWorktree(defaultWorktree); }, [defaultWorktree]);
    useEffect(() => {
        if (show) { setTitle(''); setContext(defaultContext); setModel(defaultModel); }
    }, [show, defaultModel, defaultContext]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
                setShowModelDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (!show) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                if (selectedWorktree && title.trim() && context.trim() && !isSubmitting) {
                    const form = document.getElementById('new-task-form') as HTMLFormElement;
                    form?.requestSubmit();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [show, selectedWorktree, title, context, isSubmitting]);

    const handleCreateWorktree = async (path: string, name: string, branch: string | null) => {
        try {
            const response = await axios.post<{ id: number; name: string; path: string; branch: string | null }>(
                route('worktrees.store'), { path, name }, { headers: { 'Accept': 'application/json' } }
            );
            const newWorktree: Worktree = {
                id: response.data?.id || Date.now(),
                name, path, branch, base_branch: 'main', is_main: false,
                created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
            };
            setWorktreeList((prev) => [newWorktree, ...prev]);
            setSelectedWorktree(newWorktree);
        } catch (error) {
            console.error('Failed to create worktree:', error);
            router.reload({ only: ['worktrees'] });
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedWorktree || !title.trim() || !context.trim()) return;
        setIsSubmitting(true);
        try {
            const response = await axios.post<{ id: number }>(
                route('todos.store', selectedWorktree.id),
                { title: title.trim(), context: context.trim(), model },
                { headers: { 'Accept': 'application/json' } }
            );
            onClose();
            if (onTaskCreated) onTaskCreated(response.data.id);
            router.reload({ only: ['todos'] });
        } catch (error) {
            console.error('Failed to create task:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const isFormValid = selectedWorktree && title.trim() && context.trim();

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
                            <DialogPanel className="w-full max-w-xl transform rounded-lg bg-bg border border-border shadow-2xl transition-all overflow-visible">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="absolute top-3 right-3 p-1.5 text-fg-muted hover:text-fg hover:bg-bg-muted rounded-md transition-colors z-10"
                                >
                                    <XIcon className="w-4 h-4" />
                                </button>

                                <form id="new-task-form" onSubmit={handleSubmit} className="p-5 space-y-4">
                                    <input
                                        type="text"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        placeholder="Task title"
                                        className="w-full px-4 py-3 text-base font-medium bg-transparent border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring text-fg placeholder:text-fg-muted"
                                        autoFocus
                                        required
                                    />

                                    <textarea
                                        value={context}
                                        onChange={(e) => setContext(e.target.value)}
                                        placeholder="Describe what you want Claude to do..."
                                        className="w-full px-4 py-3 text-sm bg-transparent border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring text-fg placeholder:text-fg-muted min-h-[100px] resize-none"
                                        required
                                    />

                                    <div className="flex items-start gap-3">
                                        <div className="flex-1">
                                            <WorktreeSelector
                                                worktrees={worktreeList}
                                                selectedWorktree={selectedWorktree}
                                                onSelect={setSelectedWorktree}
                                                onCreateWorktree={handleCreateWorktree}
                                                defaultProjectsPath={defaultProjectsPath}
                                            />
                                        </div>

                                        <div className="relative" ref={modelDropdownRef}>
                                            <button
                                                type="button"
                                                onClick={() => setShowModelDropdown(!showModelDropdown)}
                                                className="flex items-center justify-between gap-2 px-4 py-2.5 bg-bg-secondary border border-border rounded-md hover:border-border-strong focus:outline-none focus:ring-1 focus:ring-ring transition-colors text-sm min-w-[100px]"
                                            >
                                                <span className="text-fg">{modelDisplayNames[model]}</span>
                                                <ChevronDownIcon className={`w-3.5 h-3.5 text-fg-muted transition-transform ${showModelDropdown ? 'rotate-180' : ''}`} />
                                            </button>

                                            {showModelDropdown && (
                                                <div className="absolute z-[9999] mt-1 right-0 w-48 bg-bg border border-border rounded-md shadow-xl overflow-hidden">
                                                    {(Object.keys(models) as ClaudeModel[]).map((modelKey) => (
                                                        <button
                                                            key={modelKey}
                                                            type="button"
                                                            onClick={() => { setModel(modelKey); setShowModelDropdown(false); }}
                                                            className={`w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-bg-muted transition-colors ${model === modelKey ? 'bg-bg-muted' : ''}`}
                                                        >
                                                            <div>
                                                                <div className="text-xs font-medium text-fg">{modelDisplayNames[modelKey]}</div>
                                                                <div className="text-[11px] text-fg-muted">{models[modelKey].description}</div>
                                                            </div>
                                                            {model === modelKey && <div className="w-1.5 h-1.5 rounded-full bg-fg" />}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between pt-2">
                                        <div className="text-[11px] text-fg-muted">
                                            <kbd className="px-1.5 py-0.5 bg-bg-muted rounded text-[10px] font-mono text-fg-muted border border-border">
                                                {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Enter
                                            </kbd>
                                            <span className="ml-1.5">to create</span>
                                        </div>
                                        <button
                                            type="submit"
                                            className={`flex items-center gap-2 px-5 py-2 text-xs font-medium rounded-md transition-all ${
                                                isFormValid && !isSubmitting
                                                    ? 'bg-fg text-accent-fg hover:opacity-90'
                                                    : 'bg-bg-muted text-fg-muted cursor-not-allowed'
                                            }`}
                                            disabled={!isFormValid || isSubmitting}
                                        >
                                            {isSubmitting ? (
                                                <>
                                                    <span className="w-3.5 h-3.5 border-[1.5px] border-accent-fg/30 border-t-accent-fg rounded-full animate-spin" />
                                                    Creating...
                                                </>
                                            ) : (
                                                <>
                                                    <SparklesIcon className="w-4 h-4" />
                                                    Create
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </form>
                            </DialogPanel>
                        </TransitionChild>
                    </div>
                </div>
            </Dialog>
        </Transition>
    );
}
