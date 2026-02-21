import { useState } from 'react';
import { router } from '@inertiajs/react';
import { Worktree, ClaudeModel, ClaudeModelsConfig } from '@/types';
import { XIcon, SparklesIcon, ChevronRightIcon } from './ui/Icons';

interface TodoCreateFormProps {
    worktree: Worktree;
    models?: ClaudeModelsConfig;
    defaultModel?: ClaudeModel;
    defaultContext?: string;
    onCancel: () => void;
}

const defaultModels: ClaudeModelsConfig = {
    sonnet: { name: 'Claude Sonnet', description: 'Fast and efficient for most tasks', flag: '--model=sonnet' },
    opus: { name: 'Claude Opus', description: 'Most capable for complex tasks', flag: '--model=opus' },
    haiku: { name: 'Claude Haiku', description: 'Fastest for simple tasks', flag: '--model=haiku' },
};

export function TodoCreateForm({ worktree, models = defaultModels, defaultModel = 'sonnet', defaultContext = '', onCancel }: TodoCreateFormProps) {
    const [title, setTitle] = useState('');
    const [context, setContext] = useState(defaultContext);
    const [model, setModel] = useState<ClaudeModel>(defaultModel);
    const [preCommand, setPreCommand] = useState('');
    const [postCommand, setPostCommand] = useState('');
    const [messagePrefix, setMessagePrefix] = useState('');
    const [messageSuffix, setMessageSuffix] = useState('');
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim() || !context.trim()) return;

        setIsSubmitting(true);

        router.post(
            route('todos.store', worktree.id),
            {
                title: title.trim(),
                context: context.trim(),
                model,
                pre_command: preCommand.trim() || null,
                post_command: postCommand.trim() || null,
                message_prefix: messagePrefix.trim() || null,
                message_suffix: messageSuffix.trim() || null,
            },
            {
                onFinish: () => setIsSubmitting(false),
            }
        );
    };

    return (
        <div className="bg-bg border border-border rounded-xl p-6 shadow-lg">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                    <SparklesIcon className="w-5 h-5 text-fg" />
                    <h2 className="text-lg font-semibold text-fg">New Task</h2>
                </div>
                <button
                    type="button"
                    onClick={onCancel}
                    className="p-1.5 text-fg-muted hover:text-fg hover:bg-bg-muted rounded transition-colors"
                >
                    <XIcon className="w-4 h-4" />
                </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Title */}
                <div>
                    <label htmlFor="title" className="block text-sm font-medium text-fg-secondary mb-1">
                        Title <span className="text-error">*</span>
                    </label>
                    <input
                        id="title"
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="What do you want to accomplish?"
                        className="w-full px-3 py-2 bg-bg border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring text-fg placeholder:text-fg-muted"
                        required
                        autoFocus
                    />
                </div>

                {/* Context / Initial Task */}
                <div>
                    <label htmlFor="context" className="block text-sm font-medium text-fg-secondary mb-1">
                        Task Description <span className="text-error">*</span>
                    </label>
                    <textarea
                        id="context"
                        value={context}
                        onChange={(e) => setContext(e.target.value)}
                        placeholder="Describe what you want Claude to do..."
                        className="w-full px-3 py-2 bg-bg border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring text-fg placeholder:text-fg-muted min-h-[120px] resize-y"
                        required
                    />
                </div>

                {/* Model Selection */}
                <div>
                    <label className="block text-sm font-medium text-fg-secondary mb-2">
                        Claude Model
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                        {(Object.keys(models) as ClaudeModel[]).map((modelKey) => (
                            <button
                                key={modelKey}
                                type="button"
                                onClick={() => setModel(modelKey)}
                                className={`p-3 text-left transition-all ${
                                    model === modelKey
                                        ? 'bg-fg/10 border-2 border-fg'
                                        : 'bg-bg-muted border-2 border-transparent hover:border-fg/30'
                                }`}
                                style={{ borderRadius: 'var(--radius-md)' }}
                            >
                                <div className="font-medium text-sm text-fg">
                                    {models[modelKey].name.replace('Claude ', '')}
                                </div>
                                <div className="text-xs text-fg-muted mt-0.5">
                                    {models[modelKey].description}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Advanced Settings Toggle */}
                <button
                    type="button"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="flex items-center gap-1 text-sm text-fg-muted hover:text-fg-secondary transition-colors"
                >
                    <ChevronRightIcon
                        className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-90' : ''}`}
                    />
                    Advanced Settings
                </button>

                {/* Advanced Settings */}
                {showAdvanced && (
                    <div className="space-y-4 p-4 bg-bg-secondary rounded-lg border border-border">
                        {/* Pre-Command */}
                        <div>
                            <label htmlFor="preCommand" className="block text-sm font-medium text-fg-secondary mb-1">
                                Pre-Command
                            </label>
                            <input
                                id="preCommand"
                                type="text"
                                value={preCommand}
                                onChange={(e) => setPreCommand(e.target.value)}
                                placeholder="e.g., npm install, git pull"
                                className="w-full px-3 py-2 bg-bg border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring text-fg placeholder:text-fg-muted font-mono text-sm"
                            />
                            <p className="text-xs text-fg-muted mt-1">
                                Command to run before starting Claude
                            </p>
                        </div>

                        {/* Post-Command */}
                        <div>
                            <label htmlFor="postCommand" className="block text-sm font-medium text-fg-secondary mb-1">
                                Post-Command
                            </label>
                            <input
                                id="postCommand"
                                type="text"
                                value={postCommand}
                                onChange={(e) => setPostCommand(e.target.value)}
                                placeholder="e.g., npm test, npm run build"
                                className="w-full px-3 py-2 bg-bg border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring text-fg placeholder:text-fg-muted font-mono text-sm"
                            />
                            <p className="text-xs text-fg-muted mt-1">
                                Command to run after Claude finishes
                            </p>
                        </div>

                        {/* Message Prefix */}
                        <div>
                            <label htmlFor="messagePrefix" className="block text-sm font-medium text-fg-secondary mb-1">
                                Message Prefix
                            </label>
                            <textarea
                                id="messagePrefix"
                                value={messagePrefix}
                                onChange={(e) => setMessagePrefix(e.target.value)}
                                placeholder="Text to prepend to every message..."
                                className="w-full px-3 py-2 bg-bg border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring text-fg placeholder:text-fg-muted text-sm min-h-[60px] resize-y"
                            />
                            <p className="text-xs text-fg-muted mt-1">
                                Added before each message sent to Claude
                            </p>
                        </div>

                        {/* Message Suffix */}
                        <div>
                            <label htmlFor="messageSuffix" className="block text-sm font-medium text-fg-secondary mb-1">
                                Message Suffix
                            </label>
                            <textarea
                                id="messageSuffix"
                                value={messageSuffix}
                                onChange={(e) => setMessageSuffix(e.target.value)}
                                placeholder="Text to append to every message..."
                                className="w-full px-3 py-2 bg-bg border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring text-fg placeholder:text-fg-muted text-sm min-h-[60px] resize-y"
                            />
                            <p className="text-xs text-fg-muted mt-1">
                                Added after each message sent to Claude
                            </p>
                        </div>
                    </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-4 py-2 text-sm font-medium rounded-md text-fg-secondary hover:text-fg hover:bg-bg-muted transition-colors"
                        disabled={isSubmitting}
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-fg text-accent-fg hover:opacity-90 transition-colors"
                        disabled={!title.trim() || !context.trim() || isSubmitting}
                    >
                        <SparklesIcon className="w-4 h-4" />
                        {isSubmitting ? 'Creating...' : 'Go'}
                    </button>
                </div>
            </form>
        </div>
    );
}
