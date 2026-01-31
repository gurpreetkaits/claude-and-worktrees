import { useState, useEffect, Fragment } from 'react';
import { router } from '@inertiajs/react';
import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react';
import { Worktree, ClaudeModel, ClaudeModelsConfig } from '@/types';
import { WorktreeSelector } from './WorktreeSelector';
import { XIcon, SparklesIcon, BrainIcon, ShieldIcon, GlobeIcon } from './ui/Icons';
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

const modelIcons: Record<ClaudeModel, React.ReactNode> = {
    opus: <BrainIcon className="w-5 h-5" />,
    sonnet: <ShieldIcon className="w-5 h-5" />,
    haiku: <GlobeIcon className="w-5 h-5" />,
};

const modelColors: Record<ClaudeModel, { bg: string; border: string; text: string }> = {
    opus: { bg: 'bg-purple-500/10', border: 'border-purple-500', text: 'text-purple-500' },
    sonnet: { bg: 'bg-brand/10', border: 'border-brand', text: 'text-brand' },
    haiku: { bg: 'bg-emerald-500/10', border: 'border-emerald-500', text: 'text-emerald-500' },
};

export function NewTaskDialog({
    show,
    worktrees,
    models = defaultModels,
    defaultWorktree,
    defaultProjectsPath,
    defaultModel = 'sonnet',
    defaultContext = '',
    onClose,
    onTaskCreated,
}: NewTaskDialogProps) {
    const [selectedWorktree, setSelectedWorktree] = useState<Worktree | null>(defaultWorktree || null);
    const [title, setTitle] = useState('');
    const [context, setContext] = useState(defaultContext);
    const [model, setModel] = useState<ClaudeModel>(defaultModel);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [worktreeList, setWorktreeList] = useState<Worktree[]>(worktrees);

    useEffect(() => {
        setWorktreeList(worktrees);
    }, [worktrees]);

    useEffect(() => {
        if (defaultWorktree) {
            setSelectedWorktree(defaultWorktree);
        }
    }, [defaultWorktree]);

    // Reset form when dialog opens
    useEffect(() => {
        if (show) {
            setTitle('');
            setContext(defaultContext);
            setModel(defaultModel);
        }
    }, [show, defaultModel, defaultContext]);

    // Cmd/Ctrl+Enter to submit
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
                route('worktrees.store'),
                { path, name },
                { headers: { 'Accept': 'application/json' } }
            );

            const newWorktree: Worktree = {
                id: response.data?.id || Date.now(),
                name: name,
                path: path,
                branch: branch,
                base_branch: 'main',
                is_main: false,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
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
                {
                    title: title.trim(),
                    context: context.trim(),
                    model,
                },
                { headers: { 'Accept': 'application/json' } }
            );

            onClose();

            // Reload todos and select the new task
            if (onTaskCreated) {
                onTaskCreated(response.data.id);
            }

            // Reload the page data to get the new todo in the list
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
                <TransitionChild
                    as={Fragment}
                    enter="ease-out duration-400"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-300"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-md" />
                </TransitionChild>

                <div className="fixed inset-0 overflow-y-auto">
                    <div className="flex min-h-full items-center justify-center p-4 sm:p-6">
                        <TransitionChild
                            as={Fragment}
                            enter="ease-out duration-400"
                            enterFrom="opacity-0 scale-95 translate-y-4"
                            enterTo="opacity-100 scale-100 translate-y-0"
                            leave="ease-in duration-300"
                            leaveFrom="opacity-100 scale-100 translate-y-0"
                            leaveTo="opacity-0 scale-95 translate-y-4"
                        >
                            <DialogPanel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-bg-primary border border-border shadow-2xl transition-all">
                                {/* Header */}
                                <div className="relative px-8 pt-8 pb-6">
                                    <div className="absolute top-4 right-4">
                                        <button
                                            type="button"
                                            onClick={onClose}
                                            className="p-2 text-text-low hover:text-text-high hover:bg-bg-panel rounded-xl transition-all duration-200"
                                        >
                                            <XIcon className="w-5 h-5" />
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-brand/20 to-brand/5 border border-brand/20">
                                            <SparklesIcon className="w-7 h-7 text-brand" />
                                        </div>
                                        <div>
                                            <h2 className="text-2xl font-bold text-text-high">Create New Task</h2>
                                            <p className="text-sm text-text-low mt-0.5">Define what you want Claude to help you with</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Form */}
                                <form id="new-task-form" onSubmit={handleSubmit} className="px-8 pb-8 space-y-6">
                                    {/* Worktree Selection */}
                                    <div className="space-y-2">
                                        <label className="flex items-center gap-2 text-sm font-semibold text-text-high">
                                            <span className="flex items-center justify-center w-5 h-5 rounded-md bg-bg-panel text-xs font-bold text-text-low">1</span>
                                            Repository
                                            <span className="text-error">*</span>
                                        </label>
                                        <WorktreeSelector
                                            worktrees={worktreeList}
                                            selectedWorktree={selectedWorktree}
                                            onSelect={setSelectedWorktree}
                                            onCreateWorktree={handleCreateWorktree}
                                            defaultProjectsPath={defaultProjectsPath}
                                        />
                                    </div>

                                    {/* Title */}
                                    <div className="space-y-2">
                                        <label htmlFor="title" className="flex items-center gap-2 text-sm font-semibold text-text-high">
                                            <span className="flex items-center justify-center w-5 h-5 rounded-md bg-bg-panel text-xs font-bold text-text-low">2</span>
                                            Task Title
                                            <span className="text-error">*</span>
                                        </label>
                                        <input
                                            id="title"
                                            type="text"
                                            value={title}
                                            onChange={(e) => setTitle(e.target.value)}
                                            placeholder="What do you want to accomplish?"
                                            className="w-full px-5 py-4 text-lg bg-bg-secondary border-2 border-transparent rounded-xl focus:outline-none focus:border-brand focus:bg-bg-primary transition-all duration-200 text-text-high placeholder:text-text-low/60"
                                            required
                                        />
                                    </div>

                                    {/* Context */}
                                    <div className="space-y-2">
                                        <label htmlFor="context" className="flex items-center gap-2 text-sm font-semibold text-text-high">
                                            <span className="flex items-center justify-center w-5 h-5 rounded-md bg-bg-panel text-xs font-bold text-text-low">3</span>
                                            Task Description
                                            <span className="text-error">*</span>
                                        </label>
                                        <textarea
                                            id="context"
                                            value={context}
                                            onChange={(e) => setContext(e.target.value)}
                                            placeholder="Describe what you want Claude to do in detail. The more context you provide, the better the results..."
                                            className="w-full px-5 py-4 text-base bg-bg-secondary border-2 border-transparent rounded-xl focus:outline-none focus:border-brand focus:bg-bg-primary transition-all duration-200 text-text-high placeholder:text-text-low/60 min-h-[160px] resize-y leading-relaxed"
                                            required
                                        />
                                    </div>

                                    {/* Model Selection */}
                                    <div className="space-y-3">
                                        <label className="flex items-center gap-2 text-sm font-semibold text-text-high">
                                            <span className="flex items-center justify-center w-5 h-5 rounded-md bg-bg-panel text-xs font-bold text-text-low">4</span>
                                            Select Model
                                        </label>
                                        <div className="grid grid-cols-3 gap-3">
                                            {(Object.keys(models) as ClaudeModel[]).map((modelKey) => {
                                                const isSelected = model === modelKey;
                                                const colors = modelColors[modelKey];
                                                return (
                                                    <button
                                                        key={modelKey}
                                                        type="button"
                                                        onClick={() => setModel(modelKey)}
                                                        className={`relative p-4 text-left transition-all duration-200 rounded-xl border-2 ${
                                                            isSelected
                                                                ? `${colors.bg} ${colors.border} shadow-lg`
                                                                : 'bg-bg-secondary border-transparent hover:border-border hover:bg-bg-panel'
                                                        }`}
                                                    >
                                                        {isSelected && (
                                                            <div className={`absolute top-2 right-2 w-2 h-2 rounded-full ${colors.text.replace('text-', 'bg-')}`} />
                                                        )}
                                                        <div className={`mb-2 ${isSelected ? colors.text : 'text-text-low'}`}>
                                                            {modelIcons[modelKey]}
                                                        </div>
                                                        <div className={`font-semibold text-sm ${isSelected ? 'text-text-high' : 'text-text-normal'}`}>
                                                            {models[modelKey].name.replace('Claude ', '')}
                                                        </div>
                                                        <div className="text-xs text-text-low mt-1 leading-snug">
                                                            {models[modelKey].description}
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Divider */}
                                    <div className="border-t border-border" />

                                    {/* Actions */}
                                    <div className="flex items-center justify-between">
                                        <div className="text-xs text-text-low">
                                            <kbd className="px-1.5 py-0.5 bg-bg-panel rounded text-text-low font-mono">
                                                {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}
                                            </kbd>
                                            <span className="mx-1">+</span>
                                            <kbd className="px-1.5 py-0.5 bg-bg-panel rounded text-text-low font-mono">Enter</kbd>
                                            <span className="ml-2">to submit</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <button
                                                type="button"
                                                onClick={onClose}
                                                className="px-6 py-2.5 text-sm font-medium text-text-normal hover:text-text-high hover:bg-bg-panel rounded-xl transition-all duration-200"
                                                disabled={isSubmitting}
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="submit"
                                                className={`flex items-center gap-2 px-8 py-2.5 text-sm font-semibold rounded-xl transition-all duration-200 ${
                                                    isFormValid && !isSubmitting
                                                        ? 'bg-brand hover:bg-brand-hover text-on-brand shadow-lg shadow-brand/25 hover:shadow-xl hover:shadow-brand/30'
                                                        : 'bg-bg-panel text-text-low cursor-not-allowed'
                                                }`}
                                                disabled={!isFormValid || isSubmitting}
                                            >
                                                {isSubmitting ? (
                                                    <>
                                                        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                                        </svg>
                                                        Creating...
                                                    </>
                                                ) : (
                                                    <>
                                                        <SparklesIcon className="w-4 h-4" />
                                                        Create Task
                                                    </>
                                                )}
                                            </button>
                                        </div>
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
