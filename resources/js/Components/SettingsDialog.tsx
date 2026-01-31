import { useState, useEffect, Fragment } from 'react';
import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react';
import { ClaudeModel, Hook, HookEvent, UserSettings, DirectoryEntry, BrowseResponse } from '@/types';
import { XIcon, SettingsIcon, PlusIcon, TrashIcon, FolderIcon, BrainIcon, ShieldIcon, GlobeIcon } from './ui/Icons';
import axios from 'axios';

interface SettingsDialogProps {
    show: boolean;
    onClose: () => void;
}

const defaultModels: Record<ClaudeModel, { name: string; description: string }> = {
    sonnet: { name: 'Claude Sonnet', description: 'Fast and efficient' },
    opus: { name: 'Claude Opus', description: 'Most capable' },
    haiku: { name: 'Claude Haiku', description: 'Fastest' },
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

function generateId(): string {
    return Math.random().toString(36).substring(2, 11);
}

export function SettingsDialog({ show, onClose }: SettingsDialogProps) {
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [activeTab, setActiveTab] = useState(0);

    const [defaultProjectsDirectory, setDefaultProjectsDirectory] = useState('');
    const [defaultContext, setDefaultContext] = useState('');
    const [defaultModel, setDefaultModel] = useState<ClaudeModel>('sonnet');
    const [hooks, setHooks] = useState<Hook[]>([]);
    const [skipPermissions, setSkipPermissions] = useState(false);
    const [autoCommit, setAutoCommit] = useState(false);
    const [showHiddenFiles, setShowHiddenFiles] = useState(false);

    const [showDirectoryBrowser, setShowDirectoryBrowser] = useState(false);
    const [browserPath, setBrowserPath] = useState('');
    const [browserEntries, setBrowserEntries] = useState<DirectoryEntry[]>([]);
    const [isBrowsing, setIsBrowsing] = useState(false);

    useEffect(() => {
        if (show) {
            loadSettings();
        }
    }, [show]);

    const loadSettings = async () => {
        setIsLoading(true);
        try {
            const response = await axios.get<UserSettings>(route('settings.show'));
            const settings = response.data;
            setDefaultProjectsDirectory(settings.default_projects_directory || '');
            setDefaultContext(settings.default_context || '');
            setDefaultModel(settings.default_model || 'sonnet');
            setHooks(settings.hooks || []);
            setSkipPermissions(settings.skip_permissions || false);
            setAutoCommit(settings.auto_commit || false);
            setShowHiddenFiles(settings.show_hidden_files || false);
        } catch (error) {
            console.error('Failed to load settings:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await axios.patch(route('settings.update'), {
                default_projects_directory: defaultProjectsDirectory || null,
                default_context: defaultContext || null,
                default_model: defaultModel,
                hooks,
                skip_permissions: skipPermissions,
                auto_commit: autoCommit,
                show_hidden_files: showHiddenFiles,
            });
            onClose();
        } catch (error) {
            console.error('Failed to save settings:', error);
        } finally {
            setIsSaving(false);
        }
    };

    const addHook = () => {
        setHooks([...hooks, { id: generateId(), directory_pattern: '*', command: '', event: 'after_change', enabled: true }]);
    };

    const updateHook = (id: string, updates: Partial<Hook>) => {
        setHooks(hooks.map((hook) => (hook.id === id ? { ...hook, ...updates } : hook)));
    };

    const removeHook = (id: string) => {
        setHooks(hooks.filter((hook) => hook.id !== id));
    };

    const browseDirectory = async (path?: string) => {
        setIsBrowsing(true);
        try {
            const response = await axios.get<BrowseResponse>('/api/browse', { params: { path } });
            setBrowserPath(response.data.path);
            setBrowserEntries(response.data.entries.filter((e) => e.isDirectory || e.name === '..'));
        } catch (error) {
            console.error('Failed to browse:', error);
        } finally {
            setIsBrowsing(false);
        }
    };

    const openDirectoryBrowser = () => {
        setShowDirectoryBrowser(true);
        browseDirectory(defaultProjectsDirectory || undefined);
    };

    const selectDirectory = (path: string) => {
        setDefaultProjectsDirectory(path);
        setShowDirectoryBrowser(false);
    };

    const tabs = ['General', 'Hooks', 'Advanced'];

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
                                            <SettingsIcon className="w-7 h-7 text-brand" />
                                        </div>
                                        <div>
                                            <h2 className="text-2xl font-bold text-text-high">Settings</h2>
                                            <p className="text-sm text-text-low mt-0.5">Configure your preferences</p>
                                        </div>
                                    </div>
                                </div>

                                {isLoading ? (
                                    <div className="px-8 pb-8 flex flex-col items-center justify-center gap-3 py-12">
                                        <svg className="animate-spin w-8 h-8 text-brand" viewBox="0 0 24 24" fill="none">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                        </svg>
                                        <span className="text-sm text-text-low">Loading settings...</span>
                                    </div>
                                ) : (
                                    <>
                                        <div className="px-8">
                                            <div className="flex gap-1 p-1 bg-bg-secondary rounded-xl">
                                                {tabs.map((tab, i) => (
                                                    <button
                                                        key={tab}
                                                        onClick={() => setActiveTab(i)}
                                                        className={`flex-1 py-2 px-4 text-sm font-medium rounded-lg transition-all duration-200 ${
                                                            activeTab === i
                                                                ? 'bg-bg-primary text-text-high shadow-sm'
                                                                : 'text-text-low hover:text-text-normal'
                                                        }`}
                                                    >
                                                        {tab}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="px-8 py-6 max-h-[50vh] overflow-y-auto scrollbar-thin">
                                            {activeTab === 0 && (
                                                <div className="space-y-6">
                                                    <div className="space-y-2">
                                                        <label className="text-sm font-semibold text-text-high">Default Projects Directory</label>
                                                        <div className="flex gap-2">
                                                            <input
                                                                type="text"
                                                                value={defaultProjectsDirectory}
                                                                onChange={(e) => setDefaultProjectsDirectory(e.target.value)}
                                                                placeholder="/Users/you/projects"
                                                                className="flex-1 px-4 py-3 bg-bg-secondary border-2 border-transparent rounded-xl focus:outline-none focus:border-brand focus:bg-bg-primary transition-all duration-200 text-text-high placeholder:text-text-low/60"
                                                            />
                                                            <button
                                                                onClick={openDirectoryBrowser}
                                                                className="flex items-center gap-2 px-4 py-3 bg-bg-panel hover:bg-bg-secondary text-text-normal font-medium rounded-xl transition-all duration-200"
                                                            >
                                                                <FolderIcon className="w-4 h-4" />
                                                                Browse
                                                            </button>
                                                        </div>
                                                        <p className="text-xs text-text-low">File browser will start from this directory</p>

                                                        {showDirectoryBrowser && (
                                                            <div className="mt-3 bg-bg-secondary rounded-xl border border-border overflow-hidden">
                                                                <div className="px-4 py-3 bg-bg-panel flex items-center justify-between border-b border-border">
                                                                    <span className="text-xs text-text-low truncate flex-1 font-mono">{browserPath || '/'}</span>
                                                                    <button
                                                                        onClick={() => setShowDirectoryBrowser(false)}
                                                                        className="text-xs text-text-low hover:text-text-high transition-colors"
                                                                    >
                                                                        Cancel
                                                                    </button>
                                                                </div>
                                                                <div className="max-h-48 overflow-y-auto scrollbar-thin">
                                                                    {isBrowsing ? (
                                                                        <div className="p-6 text-center">
                                                                            <svg className="animate-spin w-5 h-5 text-brand mx-auto" viewBox="0 0 24 24" fill="none">
                                                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                                                            </svg>
                                                                        </div>
                                                                    ) : (
                                                                        <>
                                                                            {browserEntries.map((entry) => (
                                                                                <div key={entry.path} className="flex items-center gap-3 px-4 py-2.5 hover:bg-bg-panel border-b border-border last:border-b-0">
                                                                                    <FolderIcon className="w-4 h-4 text-text-low" />
                                                                                    <button
                                                                                        onClick={() => browseDirectory(entry.path)}
                                                                                        className="flex-1 text-left text-sm text-text-normal hover:text-brand truncate transition-colors"
                                                                                    >
                                                                                        {entry.name}
                                                                                    </button>
                                                                                    {entry.name !== '..' && (
                                                                                        <button
                                                                                            onClick={() => selectDirectory(entry.path)}
                                                                                            className="px-3 py-1 text-xs font-medium bg-brand hover:bg-brand-hover text-on-brand rounded-lg transition-colors"
                                                                                        >
                                                                                            Select
                                                                                        </button>
                                                                                    )}
                                                                                </div>
                                                                            ))}
                                                                            <div className="p-3 bg-bg-panel">
                                                                                <button
                                                                                    onClick={() => selectDirectory(browserPath)}
                                                                                    className="w-full py-2 text-sm font-medium bg-brand hover:bg-brand-hover text-on-brand rounded-lg transition-colors"
                                                                                >
                                                                                    Select Current Directory
                                                                                </button>
                                                                            </div>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="space-y-2">
                                                        <label className="text-sm font-semibold text-text-high">Default Context</label>
                                                        <textarea
                                                            value={defaultContext}
                                                            onChange={(e) => setDefaultContext(e.target.value)}
                                                            placeholder="Context to include with all new tasks..."
                                                            className="w-full px-4 py-3 bg-bg-secondary border-2 border-transparent rounded-xl focus:outline-none focus:border-brand focus:bg-bg-primary transition-all duration-200 text-text-high placeholder:text-text-low/60 min-h-[100px] resize-y"
                                                        />
                                                        <p className="text-xs text-text-low">Pre-filled for all new tasks</p>
                                                    </div>

                                                    <div className="space-y-3">
                                                        <label className="text-sm font-semibold text-text-high">Default Model</label>
                                                        <div className="grid grid-cols-3 gap-3">
                                                            {(['sonnet', 'opus', 'haiku'] as ClaudeModel[]).map((modelKey) => {
                                                                const isSelected = defaultModel === modelKey;
                                                                const colors = modelColors[modelKey];
                                                                return (
                                                                    <button
                                                                        key={modelKey}
                                                                        type="button"
                                                                        onClick={() => setDefaultModel(modelKey)}
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
                                                                            {defaultModels[modelKey].name.replace('Claude ', '')}
                                                                        </div>
                                                                        <div className="text-xs text-text-low mt-1">
                                                                            {defaultModels[modelKey].description}
                                                                        </div>
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {activeTab === 1 && (
                                                <div className="space-y-4">
                                                    <div className="p-4 bg-info/10 border border-info/20 rounded-xl text-sm text-text-normal">
                                                        Define commands to run on file changes or task lifecycle events.
                                                    </div>

                                                    {hooks.length === 0 ? (
                                                        <div className="text-center py-12">
                                                            <div className="w-12 h-12 rounded-full bg-bg-panel flex items-center justify-center mx-auto mb-3">
                                                                <PlusIcon className="w-6 h-6 text-text-low" />
                                                            </div>
                                                            <p className="text-text-normal">No hooks configured</p>
                                                            <p className="text-sm text-text-low mt-1">Add a hook to run commands on file changes</p>
                                                        </div>
                                                    ) : (
                                                        <div className="space-y-3">
                                                            {hooks.map((hook) => (
                                                                <div key={hook.id} className="bg-bg-secondary rounded-xl border border-border p-4 space-y-3">
                                                                    <div className="flex items-center gap-3">
                                                                        <label className="flex items-center gap-2 cursor-pointer">
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={hook.enabled}
                                                                                onChange={(e) => updateHook(hook.id, { enabled: e.target.checked })}
                                                                                className="w-4 h-4 rounded border-border text-brand focus:ring-brand/30"
                                                                            />
                                                                            <span className="text-sm text-text-normal">Enabled</span>
                                                                        </label>
                                                                        <div className="flex-1" />
                                                                        <button
                                                                            onClick={() => removeHook(hook.id)}
                                                                            className="p-2 text-error hover:bg-error/10 rounded-lg transition-colors"
                                                                        >
                                                                            <TrashIcon className="w-4 h-4" />
                                                                        </button>
                                                                    </div>
                                                                    <div className="grid grid-cols-2 gap-3">
                                                                        <div className="space-y-1">
                                                                            <label className="text-xs font-medium text-text-low">Directory Pattern</label>
                                                                            <input
                                                                                type="text"
                                                                                value={hook.directory_pattern}
                                                                                onChange={(e) => updateHook(hook.id, { directory_pattern: e.target.value })}
                                                                                placeholder="*.ts, src/**/*"
                                                                                className="w-full px-3 py-2 bg-bg-primary border border-border rounded-lg focus:outline-none focus:border-brand transition-colors text-sm text-text-high placeholder:text-text-low/60"
                                                                            />
                                                                        </div>
                                                                        <div className="space-y-1">
                                                                            <label className="text-xs font-medium text-text-low">Event</label>
                                                                            <select
                                                                                value={hook.event}
                                                                                onChange={(e) => updateHook(hook.id, { event: e.target.value as HookEvent })}
                                                                                className="w-full px-3 py-2 bg-bg-primary border border-border rounded-lg focus:outline-none focus:border-brand transition-colors text-sm text-text-high"
                                                                            >
                                                                                <optgroup label="File Events">
                                                                                    <option value="before_change">Before Change</option>
                                                                                    <option value="after_change">After Change</option>
                                                                                </optgroup>
                                                                                <optgroup label="Task Events">
                                                                                    <option value="task_started">Task Started</option>
                                                                                    <option value="task_completed">Task Completed</option>
                                                                                    <option value="task_failed">Task Failed</option>
                                                                                </optgroup>
                                                                            </select>
                                                                        </div>
                                                                    </div>
                                                                    <div className="space-y-1">
                                                                        <label className="text-xs font-medium text-text-low">Command</label>
                                                                        <input
                                                                            type="text"
                                                                            value={hook.command}
                                                                            onChange={(e) => updateHook(hook.id, { command: e.target.value })}
                                                                            placeholder="npm run lint"
                                                                            className="w-full px-3 py-2 bg-bg-primary border border-border rounded-lg focus:outline-none focus:border-brand transition-colors text-sm text-text-high placeholder:text-text-low/60"
                                                                        />
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}

                                                    <button
                                                        onClick={addHook}
                                                        className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-text-normal hover:text-text-high border border-border hover:border-brand rounded-xl transition-all duration-200"
                                                    >
                                                        <PlusIcon className="w-4 h-4" />
                                                        Add Hook
                                                    </button>
                                                </div>
                                            )}

                                            {activeTab === 2 && (
                                                <div className="space-y-3">
                                                    {[
                                                        { label: 'Skip Permissions', desc: 'Skip file operation confirmations (use with caution)', value: skipPermissions, setter: setSkipPermissions },
                                                        { label: 'Auto Commit', desc: 'Automatically commit changes after task completion', value: autoCommit, setter: setAutoCommit },
                                                        { label: 'Show Hidden Files', desc: 'Show hidden files (starting with .) in the file browser', value: showHiddenFiles, setter: setShowHiddenFiles },
                                                    ].map((item) => (
                                                        <label
                                                            key={item.label}
                                                            className="flex items-center gap-4 p-4 bg-bg-secondary rounded-xl cursor-pointer hover:bg-bg-panel transition-colors"
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={item.value}
                                                                onChange={(e) => item.setter(e.target.checked)}
                                                                className="w-5 h-5 rounded border-border text-brand focus:ring-brand/30"
                                                            />
                                                            <div>
                                                                <span className="text-sm font-medium text-text-high">{item.label}</span>
                                                                <p className="text-xs text-text-low mt-0.5">{item.desc}</p>
                                                            </div>
                                                        </label>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        <div className="border-t border-border" />

                                        <div className="flex items-center justify-end gap-3 px-8 py-6">
                                            <button
                                                onClick={onClose}
                                                className="px-6 py-2.5 text-sm font-medium text-text-normal hover:text-text-high hover:bg-bg-panel rounded-xl transition-all duration-200"
                                                disabled={isSaving}
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onClick={handleSave}
                                                className={`flex items-center gap-2 px-8 py-2.5 text-sm font-semibold rounded-xl transition-all duration-200 ${
                                                    !isSaving
                                                        ? 'bg-brand hover:bg-brand-hover text-on-brand shadow-lg shadow-brand/25 hover:shadow-xl hover:shadow-brand/30'
                                                        : 'bg-bg-panel text-text-low cursor-not-allowed'
                                                }`}
                                                disabled={isSaving}
                                            >
                                                {isSaving ? (
                                                    <>
                                                        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                                        </svg>
                                                        Saving...
                                                    </>
                                                ) : (
                                                    'Save Settings'
                                                )}
                                            </button>
                                        </div>
                                    </>
                                )}
                            </DialogPanel>
                        </TransitionChild>
                    </div>
                </div>
            </Dialog>
        </Transition>
    );
}
