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
        <div className="fixed inset-0 z-50 bg-white dark:bg-zinc-950 overflow-auto">
            <div className="max-w-6xl mx-auto px-6 py-8">
                {/* Header */}
                <div className="flex items-center justify-between mb-8 sticky top-0 bg-white dark:bg-zinc-950 py-4 -mt-4 z-10 border-b border-zinc-100 dark:border-white/5">
                    <h1 className="text-2xl font-semibold text-zinc-900 dark:text-white">Settings</h1>
                    <button
                        onClick={onClose}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white border border-zinc-200 dark:border-white/10 rounded-lg hover:border-zinc-300 dark:hover:border-white/20 transition-colors"
                    >
                        <XIcon className="w-4 h-4" />
                        <span className="text-xs font-medium">ESC</span>
                    </button>
                </div>

                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-32 gap-3">
                        <svg className="animate-spin w-8 h-8 text-orange-500" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        <span className="text-sm text-zinc-500">Loading settings...</span>
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
                                                    ? 'bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400'
                                                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-white/5'
                                            }`}
                                        >
                                            <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${isActive ? 'text-orange-500' : 'text-zinc-400 dark:text-zinc-500'}`} />
                                            <div className="flex-1 min-w-0">
                                                <div className={`font-medium ${isActive ? 'text-orange-600 dark:text-orange-400' : 'text-zinc-700 dark:text-zinc-300'}`}>
                                                    {tab.name}
                                                </div>
                                                <div className="text-xs text-zinc-500 dark:text-zinc-500">
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
                                    <div className="bg-zinc-50 dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-white/5 p-6 space-y-6">
                                        <div>
                                            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-1">Projects Directory</h3>
                                            <p className="text-sm text-zinc-500 mb-4">Default location for browsing and creating projects</p>
                                            <div className="flex gap-3">
                                                <input
                                                    type="text"
                                                    value={defaultProjectsDirectory}
                                                    onChange={(e) => setDefaultProjectsDirectory(e.target.value)}
                                                    placeholder="/Users/you/projects"
                                                    className="flex-1 px-4 py-3 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-zinc-900 dark:text-white placeholder:text-zinc-400"
                                                />
                                                <button
                                                    onClick={openDirectoryBrowser}
                                                    className="flex items-center gap-2 px-4 py-3 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-300 font-medium rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
                                                >
                                                    <FolderIcon className="w-4 h-4" />
                                                    Browse
                                                </button>
                                            </div>

                                            {showDirectoryBrowser && (
                                                <div className="mt-4 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-white/10 overflow-hidden">
                                                    <div className="px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50 flex items-center justify-between border-b border-zinc-200 dark:border-white/5">
                                                        <span className="text-xs text-zinc-500 truncate flex-1 font-mono">{browserPath || '/'}</span>
                                                        <button
                                                            onClick={() => setShowDirectoryBrowser(false)}
                                                            className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                    <div className="max-h-48 overflow-y-auto">
                                                        {isBrowsing ? (
                                                            <div className="p-6 text-center">
                                                                <svg className="animate-spin w-5 h-5 text-orange-500 mx-auto" viewBox="0 0 24 24" fill="none">
                                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                                                </svg>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                {browserEntries.map((entry) => (
                                                                    <div key={entry.path} className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 border-b border-zinc-100 dark:border-white/5 last:border-b-0">
                                                                        <FolderIcon className="w-4 h-4 text-zinc-400" />
                                                                        <button
                                                                            onClick={() => browseDirectory(entry.path)}
                                                                            className="flex-1 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:text-orange-500 truncate transition-colors"
                                                                        >
                                                                            {entry.name}
                                                                        </button>
                                                                        {entry.name !== '..' && (
                                                                            <button
                                                                                onClick={() => selectDirectory(entry.path)}
                                                                                className="px-3 py-1 text-xs font-medium bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors"
                                                                            >
                                                                                Select
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                                <div className="p-3 bg-zinc-50 dark:bg-zinc-800/50">
                                                                    <button
                                                                        onClick={() => selectDirectory(browserPath)}
                                                                        className="w-full py-2 text-sm font-medium bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors"
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

                                        <div className="border-t border-zinc-200 dark:border-white/5 pt-6">
                                            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-1">Default Context</h3>
                                            <p className="text-sm text-zinc-500 mb-4">Pre-filled context for all new tasks</p>
                                            <textarea
                                                value={defaultContext}
                                                onChange={(e) => setDefaultContext(e.target.value)}
                                                placeholder="Context to include with all new tasks..."
                                                className="w-full px-4 py-3 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-zinc-900 dark:text-white placeholder:text-zinc-400 min-h-[120px] resize-y"
                                            />
                                        </div>

                                        <div className="border-t border-zinc-200 dark:border-white/5 pt-6">
                                            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-1">Default Model</h3>
                                            <p className="text-sm text-zinc-500 mb-4">Model used for new tasks</p>
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
                                                                    : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-white/10 hover:border-zinc-300 dark:hover:border-white/20'
                                                            }`}
                                                        >
                                                            {isSelected && (
                                                                <div className={`absolute top-3 right-3 w-2 h-2 rounded-full ${colors.text.replace('text-', 'bg-')}`} />
                                                            )}
                                                            <div className={`mb-2 ${isSelected ? colors.text : 'text-zinc-400 dark:text-zinc-500'}`}>
                                                                {modelIcons[modelKey]}
                                                            </div>
                                                            <div className={`font-semibold text-sm ${isSelected ? 'text-zinc-900 dark:text-white' : 'text-zinc-700 dark:text-zinc-300'}`}>
                                                                {defaultModels[modelKey].name.replace('Claude ', '')}
                                                            </div>
                                                            <div className="text-xs text-zinc-500 mt-1">
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
                                    <div className="bg-zinc-50 dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-white/5 p-6 space-y-6">
                                        <div>
                                            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-1">Theme</h3>
                                            <p className="text-sm text-zinc-500 mb-4">Choose how the application looks</p>
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
                                                                    ? 'bg-orange-500/10 border-orange-500 shadow-lg'
                                                                    : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-white/10 hover:border-zinc-300 dark:hover:border-white/20'
                                                            }`}
                                                        >
                                                            {isSelected && (
                                                                <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-orange-500" />
                                                            )}
                                                            <div className={`mb-2 ${isSelected ? 'text-orange-500' : 'text-zinc-400 dark:text-zinc-500'}`}>
                                                                <Icon className="w-5 h-5" />
                                                            </div>
                                                            <div className={`font-semibold text-sm ${isSelected ? 'text-zinc-900 dark:text-white' : 'text-zinc-700 dark:text-zinc-300'}`}>
                                                                {option.name}
                                                            </div>
                                                            <div className="text-xs text-zinc-500 mt-1">
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
                                    <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-500/20 rounded-xl p-4 text-sm text-zinc-700 dark:text-zinc-300">
                                        Define commands to run on file changes or task lifecycle events.
                                    </div>

                                    {hooks.length === 0 ? (
                                        <div className="text-center py-16 bg-zinc-50 dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-white/5">
                                            <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mx-auto mb-4">
                                                <PlusIcon className="w-6 h-6 text-zinc-400" />
                                            </div>
                                            <p className="text-zinc-700 dark:text-zinc-300 font-medium">No hooks configured</p>
                                            <p className="text-sm text-zinc-500 mt-1">Add a hook to run commands on file changes</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {hooks.map((hook) => (
                                                <div key={hook.id} className="bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-white/5 p-5 space-y-4">
                                                    <div className="flex items-center gap-3">
                                                        <label className="flex items-center gap-2 cursor-pointer">
                                                            <input
                                                                type="checkbox"
                                                                checked={hook.enabled}
                                                                onChange={(e) => updateHook(hook.id, { enabled: e.target.checked })}
                                                                className="w-4 h-4 rounded border-zinc-300 dark:border-zinc-600 text-orange-500 focus:ring-orange-500/30"
                                                            />
                                                            <span className="text-sm text-zinc-700 dark:text-zinc-300">Enabled</span>
                                                        </label>
                                                        <div className="flex-1" />
                                                        <button
                                                            onClick={() => removeHook(hook.id)}
                                                            className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                                                        >
                                                            <TrashIcon className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div className="space-y-2">
                                                            <label className="text-xs font-medium text-zinc-500">Directory Pattern</label>
                                                            <input
                                                                type="text"
                                                                value={hook.directory_pattern}
                                                                onChange={(e) => updateHook(hook.id, { directory_pattern: e.target.value })}
                                                                placeholder="*.ts, src/**/*"
                                                                className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-white/10 rounded-lg focus:outline-none focus:border-orange-500 transition-colors text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400"
                                                            />
                                                        </div>
                                                        <div className="space-y-2">
                                                            <label className="text-xs font-medium text-zinc-500">Event</label>
                                                            <select
                                                                value={hook.event}
                                                                onChange={(e) => updateHook(hook.id, { event: e.target.value as HookEvent })}
                                                                className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-white/10 rounded-lg focus:outline-none focus:border-orange-500 transition-colors text-sm text-zinc-900 dark:text-white"
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
                                                        <label className="text-xs font-medium text-zinc-500">Command</label>
                                                        <input
                                                            type="text"
                                                            value={hook.command}
                                                            onChange={(e) => updateHook(hook.id, { command: e.target.value })}
                                                            placeholder="npm run lint"
                                                            className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-white/10 rounded-lg focus:outline-none focus:border-orange-500 transition-colors text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400"
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <button
                                        onClick={addHook}
                                        className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white border border-zinc-200 dark:border-white/10 hover:border-orange-500 rounded-xl transition-all"
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
                                        <div className="flex-1 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-500/20 rounded-xl p-4 text-sm text-zinc-700 dark:text-zinc-300">
                                            Configure MCP (Model Context Protocol) servers for Claude. These servers provide additional capabilities.
                                        </div>
                                        <button
                                            onClick={syncMcpConfig}
                                            disabled={isSyncing}
                                            className="ml-4 flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-xl transition-all disabled:opacity-50"
                                        >
                                            {syncSuccess ? (
                                                <CheckIcon className="w-4 h-4 text-emerald-500" />
                                            ) : (
                                                <RefreshIcon className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                                            )}
                                            {syncSuccess ? 'Synced' : 'Sync Config'}
                                        </button>
                                    </div>

                                    {/* Preconfigured Servers */}
                                    <div className="bg-zinc-50 dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-white/5 p-6">
                                        <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-1">Popular MCP Servers</h3>
                                        <p className="text-sm text-zinc-500 mb-4">Click to add a preconfigured server</p>
                                        <div className="grid grid-cols-2 gap-3">
                                            {PRECONFIGURED_MCP_SERVERS.filter(
                                                server => !mcpServers.some(s => s.name === server.key)
                                            ).map((server) => (
                                                <button
                                                    key={server.key}
                                                    type="button"
                                                    onClick={() => addPreconfiguredServer(server)}
                                                    className="flex items-start gap-3 p-4 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 hover:border-zinc-300 dark:hover:border-white/20 transition-colors text-left group"
                                                >
                                                    <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0">
                                                        <span className="text-base font-bold text-orange-500">
                                                            {server.name.slice(0, 1).toUpperCase()}
                                                        </span>
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="text-sm font-medium text-zinc-900 dark:text-white">
                                                            {server.name}
                                                        </div>
                                                        <div className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 mt-0.5">
                                                            {server.description}
                                                        </div>
                                                    </div>
                                                    <PlusIcon className="w-5 h-5 text-zinc-400 group-hover:text-orange-500 shrink-0 transition-colors" />
                                                </button>
                                            ))}
                                        </div>
                                        {PRECONFIGURED_MCP_SERVERS.every(
                                            server => mcpServers.some(s => s.name === server.key)
                                        ) && (
                                            <p className="text-sm text-zinc-500 italic text-center py-4">
                                                All preconfigured servers have been added
                                            </p>
                                        )}
                                    </div>

                                    {/* Configured Servers */}
                                    <div className="bg-zinc-50 dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-white/5 p-6">
                                        <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">Configured Servers</h3>

                                        {isLoadingMcp ? (
                                            <div className="text-center py-12">
                                                <svg className="animate-spin w-8 h-8 text-orange-500 mx-auto" viewBox="0 0 24 24" fill="none">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                                </svg>
                                            </div>
                                        ) : mcpServers.length === 0 && !showAddMcpForm ? (
                                            <div className="text-center py-8 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-white/5">
                                                <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-700 flex items-center justify-center mx-auto mb-3">
                                                    <TerminalIcon className="w-5 h-5 text-zinc-400" />
                                                </div>
                                                <p className="text-sm text-zinc-600 dark:text-zinc-400">No MCP servers configured</p>
                                                <p className="text-xs text-zinc-500 mt-1">Add a server from above or create a custom one</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                {mcpServers.map((server) => (
                                                    <div key={server.id} className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-white/10 p-4">
                                                        <div className="flex items-center gap-3">
                                                            <label className="flex items-center cursor-pointer">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={server.enabled}
                                                                    onChange={() => toggleMcpServer(server)}
                                                                    className="w-4 h-4 rounded border-zinc-300 dark:border-zinc-600 text-orange-500 focus:ring-orange-500/30"
                                                                />
                                                            </label>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="font-medium text-zinc-900 dark:text-white truncate">{server.name}</div>
                                                                <div className="text-xs text-zinc-500 font-mono truncate">{server.command || server.type}</div>
                                                            </div>
                                                            <button
                                                                onClick={() => deleteMcpServer(server)}
                                                                className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                                                            >
                                                                <TrashIcon className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                        {(server.args?.length > 0 || Object.keys(server.env || {}).length > 0) && (
                                                            <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-white/5 space-y-1">
                                                                {server.args?.length > 0 && (
                                                                    <div>
                                                                        <span className="text-xs font-medium text-zinc-400">Args: </span>
                                                                        <span className="text-xs text-zinc-600 dark:text-zinc-300 font-mono">{server.args.join(' ')}</span>
                                                                    </div>
                                                                )}
                                                                {Object.keys(server.env || {}).length > 0 && (
                                                                    <div>
                                                                        <span className="text-xs font-medium text-zinc-400">Env: </span>
                                                                        <span className="text-xs text-zinc-600 dark:text-zinc-300 font-mono">
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
                                            <div className="mt-4 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-white/10 p-5 space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <span className="font-medium text-zinc-900 dark:text-white">Add Custom MCP Server</span>
                                                    <button
                                                        onClick={() => {
                                                            setShowAddMcpForm(false);
                                                            setMcpForm({ name: '', command: '', args: '', env: '' });
                                                            setMcpError(null);
                                                        }}
                                                        className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                                {mcpError && (
                                                    <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500/20 rounded-lg text-sm text-red-600 dark:text-red-400">
                                                        {mcpError}
                                                    </div>
                                                )}
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="space-y-2">
                                                        <label className="text-xs font-medium text-zinc-500">Name</label>
                                                        <input
                                                            type="text"
                                                            value={mcpForm.name}
                                                            onChange={(e) => setMcpForm({ ...mcpForm, name: e.target.value })}
                                                            placeholder="my-mcp-server"
                                                            className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-lg focus:outline-none focus:border-orange-500 transition-colors text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400"
                                                        />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <label className="text-xs font-medium text-zinc-500">Command</label>
                                                        <input
                                                            type="text"
                                                            value={mcpForm.command}
                                                            onChange={(e) => setMcpForm({ ...mcpForm, command: e.target.value })}
                                                            placeholder="npx"
                                                            className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-lg focus:outline-none focus:border-orange-500 transition-colors text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-xs font-medium text-zinc-500">Arguments (one per line)</label>
                                                    <textarea
                                                        value={mcpForm.args}
                                                        onChange={(e) => setMcpForm({ ...mcpForm, args: e.target.value })}
                                                        placeholder={"-y\n@anthropic/mcp-server-example"}
                                                        className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-lg focus:outline-none focus:border-orange-500 transition-colors text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 min-h-[60px] resize-y font-mono"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-xs font-medium text-zinc-500">Environment Variables (KEY=value, one per line)</label>
                                                    <textarea
                                                        value={mcpForm.env}
                                                        onChange={(e) => setMcpForm({ ...mcpForm, env: e.target.value })}
                                                        placeholder="API_KEY=your-key"
                                                        className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-lg focus:outline-none focus:border-orange-500 transition-colors text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 min-h-[60px] resize-y font-mono"
                                                    />
                                                </div>
                                                <button
                                                    onClick={addMcpServer}
                                                    disabled={!mcpForm.name.trim() || !mcpForm.command.trim()}
                                                    className="w-full py-2.5 text-sm font-medium bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    Add Server
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => setShowAddMcpForm(true)}
                                                className="mt-4 flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white border border-zinc-200 dark:border-white/10 hover:border-orange-500 rounded-xl transition-all"
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
                                <div className="bg-zinc-50 dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-white/5 p-6 space-y-4">
                                    {[
                                        { label: 'Skip Permissions', desc: 'Skip file operation confirmations (use with caution)', value: skipPermissions, setter: setSkipPermissions },
                                        { label: 'Auto Commit', desc: 'Automatically commit changes after task completion', value: autoCommit, setter: setAutoCommit },
                                        { label: 'Show Hidden Files', desc: 'Show hidden files (starting with .) in the file browser', value: showHiddenFiles, setter: setShowHiddenFiles },
                                    ].map((item) => (
                                        <label
                                            key={item.label}
                                            className="flex items-center gap-4 p-4 bg-white dark:bg-zinc-800 rounded-xl cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors border border-zinc-200 dark:border-white/10"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={item.value}
                                                onChange={(e) => item.setter(e.target.checked)}
                                                className="w-5 h-5 rounded border-zinc-300 dark:border-zinc-600 text-orange-500 focus:ring-orange-500/30"
                                            />
                                            <div>
                                                <span className="text-sm font-medium text-zinc-900 dark:text-white">{item.label}</span>
                                                <p className="text-xs text-zinc-500 mt-0.5">{item.desc}</p>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            )}

                            {/* Save Button */}
                            <div className="mt-8 flex items-center justify-end gap-3 pt-6 border-t border-zinc-200 dark:border-white/5">
                                <button
                                    onClick={onClose}
                                    className="px-5 py-2.5 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5 rounded-xl transition-colors"
                                    disabled={isSaving}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSave}
                                    className={`flex items-center gap-2 px-6 py-2.5 text-sm font-medium rounded-xl transition-all ${
                                        !isSaving
                                            ? 'bg-orange-500 hover:bg-orange-600 text-white shadow-lg shadow-orange-500/20'
                                            : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed'
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
