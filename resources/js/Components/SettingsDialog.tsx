import { useState, useEffect, useCallback } from 'react';
import { ClaudeModel, Hook, HookEvent, UserSettings, DirectoryEntry, BrowseResponse, McpServer } from '@/types';
import { XIcon, SettingsIcon, PlusIcon, TrashIcon, FolderIcon, BrainIcon, ShieldIcon, GlobeIcon, TerminalIcon, RefreshIcon, CheckIcon, SunIcon, MoonIcon, MonitorIcon } from './ui/Icons';
import { useTheme } from '@/contexts/ThemeContext';
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
    sonnet: { bg: 'bg-orange-500/10', border: 'border-orange-500', text: 'text-orange-500' },
    haiku: { bg: 'bg-emerald-500/10', border: 'border-emerald-500', text: 'text-emerald-500' },
};

// Default MCP servers configuration (excluding vibe_kanban)
interface PreconfiguredMcpServer {
    key: string;
    name: string;
    description: string;
    command: string;
    args: string[];
    env?: Record<string, string>;
    type?: 'stdio' | 'http';
    url?: string;
    headers?: Record<string, string>;
}

const PRECONFIGURED_MCP_SERVERS: PreconfiguredMcpServer[] = [
    {
        key: 'context7',
        name: 'Context7',
        description: 'Fetch up-to-date documentation and code examples',
        command: '',
        args: [],
        type: 'http',
        url: 'https://mcp.context7.com/mcp',
        headers: { 'CONTEXT7_API_KEY': 'YOUR_API_KEY' },
    },
    {
        key: 'playwright',
        name: 'Playwright',
        description: 'Browser automation with Playwright',
        command: 'npx',
        args: ['@playwright/mcp@latest'],
    },
    {
        key: 'exa',
        name: 'Exa',
        description: 'Web search and code context retrieval powered by Exa AI',
        command: 'npx',
        args: ['-y', 'exa-mcp-server', 'tools=web_search_exa,get_code_context_exa'],
        env: { 'EXA_API_KEY': 'YOUR_API_KEY' },
    },
    {
        key: 'chrome_devtools',
        name: 'Chrome DevTools',
        description: 'Browser automation, debugging and performance analysis with Chrome DevTools',
        command: 'npx',
        args: ['chrome-devtools-mcp@latest'],
    },
    {
        key: 'dev_manager',
        name: 'Dev Manager',
        description: 'Launch and manage multiple dev servers in parallel with automatic port allocation',
        command: 'npx',
        args: ['dev-manager-mcp', 'stdio'],
    },
];

function generateId(): string {
    return Math.random().toString(36).substring(2, 11);
}

const tabs = [
    { name: 'General', description: 'Basic preferences and defaults', icon: SettingsIcon },
    { name: 'Appearance', description: 'Theme and display', icon: SunIcon },
    { name: 'Hooks', description: 'Automation and commands', icon: TerminalIcon },
    { name: 'MCP Servers', description: 'Model context protocol', icon: GlobeIcon },
    { name: 'Advanced', description: 'Developer options', icon: ShieldIcon },
];

export function SettingsDialog({ show, onClose }: SettingsDialogProps) {
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [activeTab, setActiveTab] = useState(0);
    const { theme, setTheme } = useTheme();

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

    // MCP Servers state
    const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
    const [isLoadingMcp, setIsLoadingMcp] = useState(false);
    const [showAddMcpForm, setShowAddMcpForm] = useState(false);
    const [mcpForm, setMcpForm] = useState({ name: '', command: '', args: '', env: '' });
    const [mcpError, setMcpError] = useState<string | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncSuccess, setSyncSuccess] = useState(false);

    // Handle ESC key
    useEffect(() => {
        if (!show) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [show, onClose]);

    useEffect(() => {
        if (show) {
            loadSettings();
            loadMcpServers();
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

    const loadMcpServers = async () => {
        setIsLoadingMcp(true);
        try {
            const response = await axios.get<{ servers: McpServer[] }>('/api/mcp-servers');
            setMcpServers(response.data.servers);
        } catch (error) {
            console.error('Failed to load MCP servers:', error);
        } finally {
            setIsLoadingMcp(false);
        }
    };

    const addMcpServer = async () => {
        setMcpError(null);
        try {
            const argsArray = mcpForm.args.trim() ? mcpForm.args.split('\n').map(s => s.trim()).filter(Boolean) : [];
            const envObject: Record<string, string> = {};
            if (mcpForm.env.trim()) {
                mcpForm.env.split('\n').forEach(line => {
                    const [key, ...valueParts] = line.split('=');
                    if (key?.trim()) {
                        envObject[key.trim()] = valueParts.join('=').trim();
                    }
                });
            }

            const response = await axios.post<{ server: McpServer }>('/api/mcp-servers', {
                name: mcpForm.name,
                command: mcpForm.command,
                args: argsArray,
                env: envObject,
                enabled: true,
            });
            setMcpServers([...mcpServers, response.data.server]);
            setMcpForm({ name: '', command: '', args: '', env: '' });
            setShowAddMcpForm(false);
        } catch (error: any) {
            setMcpError(error.response?.data?.message || 'Failed to add MCP server');
        }
    };

    const addPreconfiguredServer = async (server: PreconfiguredMcpServer) => {
        try {
            const response = await axios.post<{ server: McpServer }>('/api/mcp-servers', {
                name: server.key,
                command: server.command,
                args: server.args,
                env: server.env || {},
                enabled: true,
                type: server.type,
                url: server.url,
                headers: server.headers,
            });
            setMcpServers([...mcpServers, response.data.server]);
        } catch (error: any) {
            setMcpError(error.response?.data?.message || 'Failed to add MCP server');
        }
    };

    const toggleMcpServer = async (server: McpServer) => {
        try {
            const response = await axios.post<{ server: McpServer }>(`/api/mcp-servers/${server.id}/toggle`);
            setMcpServers(mcpServers.map(s => s.id === server.id ? response.data.server : s));
        } catch (error) {
            console.error('Failed to toggle MCP server:', error);
        }
    };

    const deleteMcpServer = async (server: McpServer) => {
        try {
            await axios.delete(`/api/mcp-servers/${server.id}`);
            setMcpServers(mcpServers.filter(s => s.id !== server.id));
        } catch (error) {
            console.error('Failed to delete MCP server:', error);
        }
    };

    const syncMcpConfig = async () => {
        setIsSyncing(true);
        setSyncSuccess(false);
        try {
            await axios.post('/api/mcp-servers/sync');
            setSyncSuccess(true);
            setTimeout(() => setSyncSuccess(false), 2000);
        } catch (error) {
            console.error('Failed to sync MCP config:', error);
        } finally {
            setIsSyncing(false);
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
        <div className="fixed inset-0 z-50 bg-bg overflow-auto">
            <div className="max-w-6xl mx-auto px-6 py-8">
                {/* Header */}
                <div className="flex items-center justify-between mb-8 sticky top-0 bg-bg py-4 -mt-4 z-10 border-b border-border">
                    <h1 className="text-2xl font-semibold text-fg">Settings</h1>
                    <button
                        onClick={onClose}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm text-fg-muted hover:text-fg border border-border rounded-lg hover:border-border-strong transition-colors"
                    >
                        <XIcon className="w-4 h-4" />
                        <span className="text-xs font-medium">ESC</span>
                    </button>
                </div>

                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-32 gap-3">
                        <svg className="animate-spin w-8 h-8 text-fg" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        <span className="text-sm text-fg-muted">Loading settings...</span>
                    </div>
                ) : (
                    <div className="flex flex-col lg:flex-row gap-8">
                        {/* Sidebar Navigation */}
                        <aside className="w-full lg:w-72 lg:shrink-0">
                            <nav className="space-y-1 lg:sticky lg:top-24">
                                {tabs.map((tab, i) => {
                                    const Icon = tab.icon;
                                    const isActive = activeTab === i;
                                    return (
                                        <button
                                            key={tab.name}
                                            onClick={() => setActiveTab(i)}
                                            className={`w-full flex items-start gap-3 px-4 py-3 text-left rounded-xl transition-all ${
                                                isActive
                                                    ? 'bg-fg/5 text-fg'
                                                    : 'text-fg-secondary hover:bg-bg-muted'
                                            }`}
                                        >
                                            <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${isActive ? 'text-fg' : 'text-fg-muted'}`} />
                                            <div className="flex-1 min-w-0">
                                                <div className={`font-medium ${isActive ? 'text-fg' : 'text-fg-secondary'}`}>
                                                    {tab.name}
                                                </div>
                                                <div className="text-xs text-fg-muted">
                                                    {tab.description}
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </nav>
                        </aside>

                        {/* Main Content */}
                        <main className="flex-1 min-w-0">
                            {/* General Tab */}
                            {activeTab === 0 && (
                                <div className="space-y-8">
                                    <div className="bg-bg-secondary rounded-2xl border border-border p-6 space-y-6">
                                        <div>
                                            <h3 className="text-lg font-semibold text-fg mb-1">Projects Directory</h3>
                                            <p className="text-sm text-fg-muted mb-4">Default location for browsing and creating projects</p>
                                            <div className="flex gap-3">
                                                <input
                                                    type="text"
                                                    value={defaultProjectsDirectory}
                                                    onChange={(e) => setDefaultProjectsDirectory(e.target.value)}
                                                    placeholder="/Users/you/projects"
                                                    className="flex-1 px-4 py-3 bg-bg border border-border rounded-xl focus:outline-none focus:ring-1 focus:ring-ring transition-all text-fg placeholder:text-fg-muted"
                                                />
                                                <button
                                                    onClick={openDirectoryBrowser}
                                                    className="flex items-center gap-2 px-4 py-3 bg-bg border border-border text-fg-secondary font-medium rounded-xl hover:bg-bg-muted transition-colors"
                                                >
                                                    <FolderIcon className="w-4 h-4" />
                                                    Browse
                                                </button>
                                            </div>

                                            {showDirectoryBrowser && (
                                                <div className="mt-4 bg-bg rounded-xl border border-border overflow-hidden">
                                                    <div className="px-4 py-3 bg-bg-secondary flex items-center justify-between border-b border-border">
                                                        <span className="text-xs text-fg-muted truncate flex-1 font-mono">{browserPath || '/'}</span>
                                                        <button
                                                            onClick={() => setShowDirectoryBrowser(false)}
                                                            className="text-xs text-fg-muted hover:text-fg transition-colors"
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                    <div className="max-h-48 overflow-y-auto">
                                                        {isBrowsing ? (
                                                            <div className="p-6 text-center">
                                                                <svg className="animate-spin w-5 h-5 text-fg mx-auto" viewBox="0 0 24 24" fill="none">
                                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                                                </svg>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                {browserEntries.map((entry) => (
                                                                    <div key={entry.path} className="flex items-center gap-3 px-4 py-2.5 hover:bg-bg-muted border-b border-border last:border-b-0">
                                                                        <FolderIcon className="w-4 h-4 text-fg-muted" />
                                                                        <button
                                                                            onClick={() => browseDirectory(entry.path)}
                                                                            className="flex-1 text-left text-sm text-fg-secondary hover:text-fg truncate transition-colors"
                                                                        >
                                                                            {entry.name}
                                                                        </button>
                                                                        {entry.name !== '..' && (
                                                                            <button
                                                                                onClick={() => selectDirectory(entry.path)}
                                                                                className="px-3 py-1 text-xs font-medium bg-fg hover:opacity-90 text-accent-fg rounded-lg transition-colors"
                                                                            >
                                                                                Select
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                                <div className="p-3 bg-bg-secondary">
                                                                    <button
                                                                        onClick={() => selectDirectory(browserPath)}
                                                                        className="w-full py-2 text-sm font-medium bg-fg hover:opacity-90 text-accent-fg rounded-lg transition-colors"
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

                                        <div className="border-t border-border pt-6">
                                            <h3 className="text-lg font-semibold text-fg mb-1">Default Context</h3>
                                            <p className="text-sm text-fg-muted mb-4">Pre-filled context for all new tasks</p>
                                            <textarea
                                                value={defaultContext}
                                                onChange={(e) => setDefaultContext(e.target.value)}
                                                placeholder="Context to include with all new tasks..."
                                                className="w-full px-4 py-3 bg-bg border border-border rounded-xl focus:outline-none focus:ring-1 focus:ring-ring transition-all text-fg placeholder:text-fg-muted min-h-[120px] resize-y"
                                            />
                                        </div>

                                        <div className="border-t border-border pt-6">
                                            <h3 className="text-lg font-semibold text-fg mb-1">Default Model</h3>
                                            <p className="text-sm text-fg-muted mb-4">Model used for new tasks</p>
                                            <div className="grid grid-cols-3 gap-4">
                                                {(['sonnet', 'opus', 'haiku'] as ClaudeModel[]).map((modelKey) => {
                                                    const isSelected = defaultModel === modelKey;
                                                    const colors = modelColors[modelKey];
                                                    return (
                                                        <button
                                                            key={modelKey}
                                                            type="button"
                                                            onClick={() => setDefaultModel(modelKey)}
                                                            className={`relative p-4 text-left transition-all rounded-xl border-2 ${
                                                                isSelected
                                                                    ? `${colors.bg} ${colors.border} shadow-lg`
                                                                    : 'bg-bg border-border hover:border-border-strong'
                                                            }`}
                                                        >
                                                            {isSelected && (
                                                                <div className={`absolute top-3 right-3 w-2 h-2 rounded-full ${colors.text.replace('text-', 'bg-')}`} />
                                                            )}
                                                            <div className={`mb-2 ${isSelected ? colors.text : 'text-fg-muted'}`}>
                                                                {modelIcons[modelKey]}
                                                            </div>
                                                            <div className={`font-semibold text-sm ${isSelected ? 'text-fg' : 'text-fg-secondary'}`}>
                                                                {defaultModels[modelKey].name.replace('Claude ', '')}
                                                            </div>
                                                            <div className="text-xs text-fg-muted mt-1">
                                                                {defaultModels[modelKey].description}
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Appearance Tab */}
                            {activeTab === 1 && (
                                <div className="space-y-8">
                                    <div className="bg-bg-secondary rounded-2xl border border-border p-6 space-y-6">
                                        <div>
                                            <h3 className="text-lg font-semibold text-fg mb-1">Theme</h3>
                                            <p className="text-sm text-fg-muted mb-4">Choose how the application looks</p>
                                            <div className="grid grid-cols-3 gap-4">
                                                {([
                                                    { key: 'light', name: 'Light', description: 'Light background', icon: SunIcon },
                                                    { key: 'dark', name: 'Dark', description: 'Dark background', icon: MoonIcon },
                                                    { key: 'system', name: 'System', description: 'Match OS setting', icon: MonitorIcon },
                                                ] as const).map((option) => {
                                                    const isSelected = theme === option.key;
                                                    const Icon = option.icon;
                                                    return (
                                                        <button
                                                            key={option.key}
                                                            type="button"
                                                            onClick={() => setTheme(option.key)}
                                                            className={`relative p-4 text-left transition-all rounded-xl border-2 ${
                                                                isSelected
                                                                    ? 'bg-fg/10 border-fg shadow-lg'
                                                                    : 'bg-bg border-border hover:border-border-strong'
                                                            }`}
                                                        >
                                                            {isSelected && (
                                                                <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-fg" />
                                                            )}
                                                            <div className={`mb-2 ${isSelected ? 'text-fg' : 'text-fg-muted'}`}>
                                                                <Icon className="w-5 h-5" />
                                                            </div>
                                                            <div className={`font-semibold text-sm ${isSelected ? 'text-fg' : 'text-fg-secondary'}`}>
                                                                {option.name}
                                                            </div>
                                                            <div className="text-xs text-fg-muted mt-1">
                                                                {option.description}
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Hooks Tab */}
                            {activeTab === 2 && (
                                <div className="space-y-6">
                                    <div className="bg-bg-muted border border-border-strong rounded-xl p-4 text-sm text-fg-secondary">
                                        Define commands to run on file changes or task lifecycle events.
                                    </div>

                                    {hooks.length === 0 ? (
                                        <div className="text-center py-16 bg-bg-secondary rounded-2xl border border-border">
                                            <div className="w-12 h-12 rounded-full bg-bg-muted flex items-center justify-center mx-auto mb-4">
                                                <PlusIcon className="w-6 h-6 text-fg-muted" />
                                            </div>
                                            <p className="text-fg-secondary font-medium">No hooks configured</p>
                                            <p className="text-sm text-fg-muted mt-1">Add a hook to run commands on file changes</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {hooks.map((hook) => (
                                                <div key={hook.id} className="bg-bg-secondary rounded-xl border border-border p-5 space-y-4">
                                                    <div className="flex items-center gap-3">
                                                        <label className="flex items-center gap-2 cursor-pointer">
                                                            <input
                                                                type="checkbox"
                                                                checked={hook.enabled}
                                                                onChange={(e) => updateHook(hook.id, { enabled: e.target.checked })}
                                                                className="w-4 h-4 rounded border-border-strong text-fg focus:ring-ring/30"
                                                            />
                                                            <span className="text-sm text-fg-secondary">Enabled</span>
                                                        </label>
                                                        <div className="flex-1" />
                                                        <button
                                                            onClick={() => removeHook(hook.id)}
                                                            className="p-2 text-error hover:bg-error/10 rounded-lg transition-colors"
                                                        >
                                                            <TrashIcon className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div className="space-y-2">
                                                            <label className="text-xs font-medium text-fg-muted">Directory Pattern</label>
                                                            <input
                                                                type="text"
                                                                value={hook.directory_pattern}
                                                                onChange={(e) => updateHook(hook.id, { directory_pattern: e.target.value })}
                                                                placeholder="*.ts, src/**/*"
                                                                className="w-full px-3 py-2 bg-bg border border-border rounded-lg focus:outline-none focus:border-ring transition-colors text-sm text-fg placeholder:text-fg-muted"
                                                            />
                                                        </div>
                                                        <div className="space-y-2">
                                                            <label className="text-xs font-medium text-fg-muted">Event</label>
                                                            <select
                                                                value={hook.event}
                                                                onChange={(e) => updateHook(hook.id, { event: e.target.value as HookEvent })}
                                                                className="w-full px-3 py-2 bg-bg border border-border rounded-lg focus:outline-none focus:border-ring transition-colors text-sm text-fg"
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
                                                    <div className="space-y-2">
                                                        <label className="text-xs font-medium text-fg-muted">Command</label>
                                                        <input
                                                            type="text"
                                                            value={hook.command}
                                                            onChange={(e) => updateHook(hook.id, { command: e.target.value })}
                                                            placeholder="npm run lint"
                                                            className="w-full px-3 py-2 bg-bg border border-border rounded-lg focus:outline-none focus:border-ring transition-colors text-sm text-fg placeholder:text-fg-muted"
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <button
                                        onClick={addHook}
                                        className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-fg-secondary hover:text-fg border border-border hover:border-fg rounded-xl transition-all"
                                    >
                                        <PlusIcon className="w-4 h-4" />
                                        Add Hook
                                    </button>
                                </div>
                            )}

                            {/* MCP Servers Tab */}
                            {activeTab === 3 && (
                                <div className="space-y-8">
                                    <div className="flex items-center justify-between">
                                        <div className="flex-1 bg-bg-muted border border-border-strong rounded-xl p-4 text-sm text-fg-secondary">
                                            Configure MCP (Model Context Protocol) servers for Claude. These servers provide additional capabilities.
                                        </div>
                                        <button
                                            onClick={syncMcpConfig}
                                            disabled={isSyncing}
                                            className="ml-4 flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-bg-muted hover:bg-bg-accent text-fg-secondary rounded-xl transition-all disabled:opacity-50"
                                        >
                                            {syncSuccess ? (
                                                <CheckIcon className="w-4 h-4 text-success" />
                                            ) : (
                                                <RefreshIcon className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                                            )}
                                            {syncSuccess ? 'Synced' : 'Sync Config'}
                                        </button>
                                    </div>

                                    {/* Preconfigured Servers */}
                                    <div className="bg-bg-secondary rounded-2xl border border-border p-6">
                                        <h3 className="text-lg font-semibold text-fg mb-1">Popular MCP Servers</h3>
                                        <p className="text-sm text-fg-muted mb-4">Click to add a preconfigured server</p>
                                        <div className="grid grid-cols-2 gap-3">
                                            {PRECONFIGURED_MCP_SERVERS.filter(
                                                server => !mcpServers.some(s => s.name === server.key)
                                            ).map((server) => (
                                                <button
                                                    key={server.key}
                                                    type="button"
                                                    onClick={() => addPreconfiguredServer(server)}
                                                    className="flex items-start gap-3 p-4 rounded-xl border border-border bg-bg hover:bg-bg-muted hover:border-border-strong transition-colors text-left group"
                                                >
                                                    <div className="w-10 h-10 rounded-xl bg-fg/10 border border-fg/20 flex items-center justify-center shrink-0">
                                                        <span className="text-base font-bold text-fg">
                                                            {server.name.slice(0, 1).toUpperCase()}
                                                        </span>
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="text-sm font-medium text-fg">
                                                            {server.name}
                                                        </div>
                                                        <div className="text-xs text-fg-muted line-clamp-2 mt-0.5">
                                                            {server.description}
                                                        </div>
                                                    </div>
                                                    <PlusIcon className="w-5 h-5 text-fg-muted group-hover:text-fg shrink-0 transition-colors" />
                                                </button>
                                            ))}
                                        </div>
                                        {PRECONFIGURED_MCP_SERVERS.every(
                                            server => mcpServers.some(s => s.name === server.key)
                                        ) && (
                                            <p className="text-sm text-fg-muted italic text-center py-4">
                                                All preconfigured servers have been added
                                            </p>
                                        )}
                                    </div>

                                    {/* Configured Servers */}
                                    <div className="bg-bg-secondary rounded-2xl border border-border p-6">
                                        <h3 className="text-lg font-semibold text-fg mb-4">Configured Servers</h3>

                                        {isLoadingMcp ? (
                                            <div className="text-center py-12">
                                                <svg className="animate-spin w-8 h-8 text-fg mx-auto" viewBox="0 0 24 24" fill="none">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                                </svg>
                                            </div>
                                        ) : mcpServers.length === 0 && !showAddMcpForm ? (
                                            <div className="text-center py-8 bg-bg rounded-xl border border-border">
                                                <div className="w-10 h-10 rounded-full bg-bg-muted flex items-center justify-center mx-auto mb-3">
                                                    <TerminalIcon className="w-5 h-5 text-fg-muted" />
                                                </div>
                                                <p className="text-sm text-fg-secondary">No MCP servers configured</p>
                                                <p className="text-xs text-fg-muted mt-1">Add a server from above or create a custom one</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                {mcpServers.map((server) => (
                                                    <div key={server.id} className="bg-bg rounded-xl border border-border p-4">
                                                        <div className="flex items-center gap-3">
                                                            <label className="flex items-center cursor-pointer">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={server.enabled}
                                                                    onChange={() => toggleMcpServer(server)}
                                                                    className="w-4 h-4 rounded border-border-strong text-fg focus:ring-ring/30"
                                                                />
                                                            </label>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="font-medium text-fg truncate">{server.name}</div>
                                                                <div className="text-xs text-fg-muted font-mono truncate">{server.command || server.type}</div>
                                                            </div>
                                                            <button
                                                                onClick={() => deleteMcpServer(server)}
                                                                className="p-2 text-error hover:bg-error/10 rounded-lg transition-colors"
                                                            >
                                                                <TrashIcon className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                        {(server.args?.length > 0 || Object.keys(server.env || {}).length > 0) && (
                                                            <div className="mt-3 pt-3 border-t border-border space-y-1">
                                                                {server.args?.length > 0 && (
                                                                    <div>
                                                                        <span className="text-xs font-medium text-fg-muted">Args: </span>
                                                                        <span className="text-xs text-fg-secondary font-mono">{server.args.join(' ')}</span>
                                                                    </div>
                                                                )}
                                                                {Object.keys(server.env || {}).length > 0 && (
                                                                    <div>
                                                                        <span className="text-xs font-medium text-fg-muted">Env: </span>
                                                                        <span className="text-xs text-fg-secondary font-mono">
                                                                            {Object.entries(server.env).map(([k, v]) => `${k}=${v.length > 20 ? v.slice(0, 20) + '...' : v}`).join(', ')}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {showAddMcpForm ? (
                                            <div className="mt-4 bg-bg rounded-xl border border-border p-5 space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <span className="font-medium text-fg">Add Custom MCP Server</span>
                                                    <button
                                                        onClick={() => {
                                                            setShowAddMcpForm(false);
                                                            setMcpForm({ name: '', command: '', args: '', env: '' });
                                                            setMcpError(null);
                                                        }}
                                                        className="text-xs text-fg-muted hover:text-fg transition-colors"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                                {mcpError && (
                                                    <div className="p-3 bg-error/5 border border-error/20 rounded-lg text-sm text-error">
                                                        {mcpError}
                                                    </div>
                                                )}
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="space-y-2">
                                                        <label className="text-xs font-medium text-fg-muted">Name</label>
                                                        <input
                                                            type="text"
                                                            value={mcpForm.name}
                                                            onChange={(e) => setMcpForm({ ...mcpForm, name: e.target.value })}
                                                            placeholder="my-mcp-server"
                                                            className="w-full px-3 py-2 bg-bg-secondary border border-border rounded-lg focus:outline-none focus:border-ring transition-colors text-sm text-fg placeholder:text-fg-muted"
                                                        />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <label className="text-xs font-medium text-fg-muted">Command</label>
                                                        <input
                                                            type="text"
                                                            value={mcpForm.command}
                                                            onChange={(e) => setMcpForm({ ...mcpForm, command: e.target.value })}
                                                            placeholder="npx"
                                                            className="w-full px-3 py-2 bg-bg-secondary border border-border rounded-lg focus:outline-none focus:border-ring transition-colors text-sm text-fg placeholder:text-fg-muted"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-xs font-medium text-fg-muted">Arguments (one per line)</label>
                                                    <textarea
                                                        value={mcpForm.args}
                                                        onChange={(e) => setMcpForm({ ...mcpForm, args: e.target.value })}
                                                        placeholder={"-y\n@anthropic/mcp-server-example"}
                                                        className="w-full px-3 py-2 bg-bg-secondary border border-border rounded-lg focus:outline-none focus:border-ring transition-colors text-sm text-fg placeholder:text-fg-muted min-h-[60px] resize-y font-mono"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-xs font-medium text-fg-muted">Environment Variables (KEY=value, one per line)</label>
                                                    <textarea
                                                        value={mcpForm.env}
                                                        onChange={(e) => setMcpForm({ ...mcpForm, env: e.target.value })}
                                                        placeholder="API_KEY=your-key"
                                                        className="w-full px-3 py-2 bg-bg-secondary border border-border rounded-lg focus:outline-none focus:border-ring transition-colors text-sm text-fg placeholder:text-fg-muted min-h-[60px] resize-y font-mono"
                                                    />
                                                </div>
                                                <button
                                                    onClick={addMcpServer}
                                                    disabled={!mcpForm.name.trim() || !mcpForm.command.trim()}
                                                    className="w-full py-2.5 text-sm font-medium bg-fg hover:opacity-90 text-accent-fg rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    Add Server
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => setShowAddMcpForm(true)}
                                                className="mt-4 flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-fg-secondary hover:text-fg border border-border hover:border-fg rounded-xl transition-all"
                                            >
                                                <PlusIcon className="w-4 h-4" />
                                                Add Custom MCP Server
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Advanced Tab */}
                            {activeTab === 4 && (
                                <div className="bg-bg-secondary rounded-2xl border border-border p-6 space-y-4">
                                    {[
                                        { label: 'Skip Permissions', desc: 'Skip file operation confirmations (use with caution)', value: skipPermissions, setter: setSkipPermissions },
                                        { label: 'Auto Commit', desc: 'Automatically commit changes after task completion', value: autoCommit, setter: setAutoCommit },
                                        { label: 'Show Hidden Files', desc: 'Show hidden files (starting with .) in the file browser', value: showHiddenFiles, setter: setShowHiddenFiles },
                                    ].map((item) => (
                                        <label
                                            key={item.label}
                                            className="flex items-center gap-4 p-4 bg-bg rounded-xl cursor-pointer hover:bg-bg-muted transition-colors border border-border"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={item.value}
                                                onChange={(e) => item.setter(e.target.checked)}
                                                className="w-5 h-5 rounded border-border-strong text-fg focus:ring-ring/30"
                                            />
                                            <div>
                                                <span className="text-sm font-medium text-fg">{item.label}</span>
                                                <p className="text-xs text-fg-muted mt-0.5">{item.desc}</p>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            )}

                            {/* Save Button */}
                            <div className="mt-8 flex items-center justify-end gap-3 pt-6 border-t border-border">
                                <button
                                    onClick={onClose}
                                    className="px-5 py-2.5 text-sm font-medium text-fg-secondary hover:text-fg hover:bg-bg-muted rounded-xl transition-colors"
                                    disabled={isSaving}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSave}
                                    className={`flex items-center gap-2 px-6 py-2.5 text-sm font-medium rounded-xl transition-all ${
                                        !isSaving
                                            ? 'bg-fg hover:opacity-90 text-accent-fg shadow-lg'
                                            : 'bg-bg-muted text-fg-muted cursor-not-allowed'
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
                        </main>
                    </div>
                )}
            </div>
        </div>
    );
}
