import { useState, useEffect } from 'react';
import { ClaudeModel, Hook, UserSettings, DirectoryEntry, BrowseResponse } from '@/types';
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

function generateId(): string {
    return Math.random().toString(36).substring(2, 11);
}

export function SettingsDialog({ show, onClose }: SettingsDialogProps) {
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [activeTab, setActiveTab] = useState(0);

    // General settings
    const [defaultProjectsDirectory, setDefaultProjectsDirectory] = useState('');
    const [defaultContext, setDefaultContext] = useState('');
    const [defaultModel, setDefaultModel] = useState<ClaudeModel>('sonnet');

    // Hooks
    const [hooks, setHooks] = useState<Hook[]>([]);

    // Advanced settings
    const [skipPermissions, setSkipPermissions] = useState(false);
    const [autoCommit, setAutoCommit] = useState(false);
    const [showHiddenFiles, setShowHiddenFiles] = useState(false);

    // Directory browser state
    const [showDirectoryBrowser, setShowDirectoryBrowser] = useState(false);
    const [browserPath, setBrowserPath] = useState('');
    const [browserEntries, setBrowserEntries] = useState<DirectoryEntry[]>([]);
    const [isBrowsing, setIsBrowsing] = useState(false);

    useEffect(() => {
        if (show) {
            loadSettings();
        }
    }, [show]);

    useEffect(() => {
        if (!show) return;
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [show, onClose]);

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

    if (!show) return null;

    return (
        <div className="modal modal-open">
            <div className="modal-box max-w-2xl bg-base-100 p-0 max-h-[85vh]">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-base-300 bg-base-200">
                    <div className="flex items-center gap-3">
                        <SettingsIcon className="w-5 h-5" />
                        <h3 className="font-bold text-lg">Settings</h3>
                    </div>
                    <button onClick={onClose} className="btn btn-sm btn-circle btn-ghost">
                        <XIcon className="w-4 h-4" />
                    </button>
                </div>

                {isLoading ? (
                    <div className="p-12 flex flex-col items-center justify-center gap-3">
                        <span className="loading loading-spinner loading-lg text-primary"></span>
                        <span className="text-sm opacity-60">Loading settings...</span>
                    </div>
                ) : (
                    <>
                        {/* Tabs */}
                        <div role="tablist" className="tabs tabs-boxed bg-base-200 mx-6 mt-4 p-1">
                            {['General', 'Hooks', 'Advanced'].map((tab, i) => (
                                <button
                                    key={tab}
                                    role="tab"
                                    className={`tab flex-1 ${activeTab === i ? 'tab-active bg-base-100' : ''}`}
                                    onClick={() => setActiveTab(i)}
                                >
                                    {tab}
                                </button>
                            ))}
                        </div>

                        <div className="p-6 overflow-y-auto max-h-[50vh]">
                            {/* General Tab */}
                            {activeTab === 0 && (
                                <div className="space-y-5">
                                    <div className="form-control">
                                        <label className="label"><span className="label-text font-medium">Default Projects Directory</span></label>
                                        <div className="join w-full">
                                            <input
                                                type="text"
                                                value={defaultProjectsDirectory}
                                                onChange={(e) => setDefaultProjectsDirectory(e.target.value)}
                                                placeholder="/Users/you/projects"
                                                className="input input-bordered join-item flex-1 text-sm"
                                            />
                                            <button onClick={openDirectoryBrowser} className="btn btn-neutral join-item gap-2">
                                                <FolderIcon className="w-4 h-4" />
                                                Browse
                                            </button>
                                        </div>
                                        <label className="label"><span className="label-text-alt opacity-60">File browser will start from this directory</span></label>

                                        {showDirectoryBrowser && (
                                            <div className="mt-2 bg-base-200 rounded-lg border border-base-300">
                                                <div className="px-4 py-2 bg-base-300 flex items-center justify-between rounded-t-lg">
                                                    <span className="text-xs truncate flex-1">{browserPath || '/'}</span>
                                                    <button onClick={() => setShowDirectoryBrowser(false)} className="btn btn-ghost btn-xs">Cancel</button>
                                                </div>
                                                <div className="max-h-48 overflow-y-auto">
                                                    {isBrowsing ? (
                                                        <div className="p-6 text-center"><span className="loading loading-spinner loading-sm"></span></div>
                                                    ) : (
                                                        <>
                                                            {browserEntries.map((entry) => (
                                                                <div key={entry.path} className="flex items-center gap-2 px-4 py-2 hover:bg-base-300 border-b border-base-300 last:border-b-0">
                                                                    <FolderIcon className="w-4 h-4 opacity-50" />
                                                                    <button onClick={() => browseDirectory(entry.path)} className="flex-1 text-left text-sm truncate hover:text-primary">{entry.name}</button>
                                                                    {entry.name !== '..' && <button onClick={() => selectDirectory(entry.path)} className="btn btn-primary btn-xs">Select</button>}
                                                                </div>
                                                            ))}
                                                            <div className="p-3 bg-base-300 rounded-b-lg">
                                                                <button onClick={() => selectDirectory(browserPath)} className="btn btn-primary btn-sm w-full">Select Current Directory</button>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="form-control">
                                        <label className="label"><span className="label-text font-medium">Default Context</span></label>
                                        <textarea
                                            value={defaultContext}
                                            onChange={(e) => setDefaultContext(e.target.value)}
                                            placeholder="Context to include with all new tasks..."
                                            className="textarea textarea-bordered min-h-[100px] resize-y"
                                        />
                                        <label className="label"><span className="label-text-alt opacity-60">Pre-filled for all new tasks</span></label>
                                    </div>

                                    <div className="form-control">
                                        <label className="label"><span className="label-text font-medium">Default Model</span></label>
                                        <div className="grid grid-cols-3 gap-3">
                                            {(['sonnet', 'opus', 'haiku'] as ClaudeModel[]).map((modelKey) => {
                                                const isSelected = defaultModel === modelKey;
                                                const colors = { opus: 'border-purple-500 bg-purple-100', sonnet: 'border-primary bg-primary/10', haiku: 'border-emerald-500 bg-emerald-100' };
                                                return (
                                                    <button
                                                        key={modelKey}
                                                        onClick={() => setDefaultModel(modelKey)}
                                                        className={`relative p-4 text-left rounded-lg border-2 transition-all ${isSelected ? colors[modelKey] : 'bg-base-200 border-base-300 hover:border-base-content/20'}`}
                                                    >
                                                        {isSelected && <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary" />}
                                                        <div className={`mb-2 ${isSelected ? 'text-primary' : 'opacity-50'}`}>{modelIcons[modelKey]}</div>
                                                        <div className="font-semibold text-sm">{defaultModels[modelKey].name.replace('Claude ', '')}</div>
                                                        <div className="text-xs opacity-60 mt-0.5">{defaultModels[modelKey].description}</div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Hooks Tab */}
                            {activeTab === 1 && (
                                <div className="space-y-4">
                                    <div className="alert alert-info text-sm">Define commands to run when files change.</div>

                                    {hooks.length === 0 ? (
                                        <div className="text-center py-12">
                                            <div className="w-12 h-12 rounded-full bg-base-200 flex items-center justify-center mx-auto mb-3">
                                                <PlusIcon className="w-6 h-6 opacity-40" />
                                            </div>
                                            <p className="opacity-70">No hooks configured</p>
                                            <p className="text-sm opacity-50 mt-1">Add a hook to run commands on file changes</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {hooks.map((hook) => (
                                                <div key={hook.id} className="bg-base-200 rounded-lg border border-base-300 p-4 space-y-3">
                                                    <div className="flex items-center gap-3">
                                                        <label className="label cursor-pointer gap-2">
                                                            <input type="checkbox" checked={hook.enabled} onChange={(e) => updateHook(hook.id, { enabled: e.target.checked })} className="checkbox checkbox-primary checkbox-sm" />
                                                            <span className="label-text">Enabled</span>
                                                        </label>
                                                        <div className="flex-1" />
                                                        <button onClick={() => removeHook(hook.id)} className="btn btn-ghost btn-sm btn-circle text-error"><TrashIcon className="w-4 h-4" /></button>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div className="form-control">
                                                            <label className="label py-1"><span className="label-text text-xs">Directory Pattern</span></label>
                                                            <input type="text" value={hook.directory_pattern} onChange={(e) => updateHook(hook.id, { directory_pattern: e.target.value })} placeholder="*.ts, src/**/*" className="input input-bordered input-sm" />
                                                        </div>
                                                        <div className="form-control">
                                                            <label className="label py-1"><span className="label-text text-xs">Event</span></label>
                                                            <select value={hook.event} onChange={(e) => updateHook(hook.id, { event: e.target.value as Hook['event'] })} className="select select-bordered select-sm">
                                                                <option value="before_change">Before Change</option>
                                                                <option value="after_change">After Change</option>
                                                            </select>
                                                        </div>
                                                    </div>
                                                    <div className="form-control">
                                                        <label className="label py-1"><span className="label-text text-xs">Command</span></label>
                                                        <input type="text" value={hook.command} onChange={(e) => updateHook(hook.id, { command: e.target.value })} placeholder="npm run lint" className="input input-bordered input-sm" />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <button onClick={addHook} className="btn btn-outline gap-2"><PlusIcon className="w-4 h-4" />Add Hook</button>
                                </div>
                            )}

                            {/* Advanced Tab */}
                            {activeTab === 2 && (
                                <div className="space-y-3">
                                    {[
                                        { label: 'Skip Permissions', desc: 'Skip file operation confirmations (use with caution)', value: skipPermissions, setter: setSkipPermissions },
                                        { label: 'Auto Commit', desc: 'Automatically commit changes after task completion', value: autoCommit, setter: setAutoCommit },
                                        { label: 'Show Hidden Files', desc: 'Show hidden files (starting with .) in the file browser', value: showHiddenFiles, setter: setShowHiddenFiles },
                                    ].map((item) => (
                                        <label key={item.label} className="flex items-center gap-4 p-4 bg-base-200 rounded-lg cursor-pointer hover:bg-base-300 transition-colors">
                                            <input type="checkbox" checked={item.value} onChange={(e) => item.setter(e.target.checked)} className="checkbox checkbox-primary" />
                                            <div>
                                                <span className="label-text font-medium">{item.label}</span>
                                                <p className="text-xs opacity-60 mt-0.5">{item.desc}</p>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                )}

                {/* Footer */}
                <div className="modal-action px-6 py-4 border-t border-base-300 bg-base-200">
                    <button onClick={onClose} className="btn btn-ghost" disabled={isSaving}>Cancel</button>
                    <button onClick={handleSave} className="btn btn-primary" disabled={isLoading || isSaving}>
                        {isSaving ? <><span className="loading loading-spinner loading-sm"></span>Saving...</> : 'Save Settings'}
                    </button>
                </div>
            </div>
            <div className="modal-backdrop bg-neutral/60" onClick={onClose}></div>
        </div>
    );
}
