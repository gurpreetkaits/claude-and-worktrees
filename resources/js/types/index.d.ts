export interface Worktree {
    id: number;
    name: string;
    path: string;
    branch: string | null;
    base_branch: string;
    is_main: boolean;
    todos_count?: number;
    created_at: string;
    updated_at: string;
}

export type ClaudeModel = 'sonnet' | 'opus' | 'haiku';
export type TodoStatus = 'pending' | 'running' | 'completed' | 'failed' | 'qa' | 'cancelled';

export interface Todo {
    id: number;
    worktree_id: number;
    worktree?: Worktree;
    title: string;
    description: string | null;
    model: ClaudeModel;
    context: string | null;
    pre_command: string | null;
    post_command: string | null;
    message_prefix: string | null;
    message_suffix: string | null;
    status: TodoStatus;
    is_archived: boolean;
    messages?: Message[];
    changes?: TodoChange[];
    created_at: string;
    updated_at: string;
}

export interface ClaudeModelInfo {
    name: string;
    description: string;
    flag: string;
}

export type ClaudeModelsConfig = Record<ClaudeModel, ClaudeModelInfo>;

export interface Message {
    id: number;
    todo_id: number;
    role: 'user' | 'assistant';
    content: string;
    is_streaming?: boolean;
    stream_session_key?: string | null;
    metadata?: Record<string, unknown> | null;
    created_at: string;
    updated_at: string;
}

export interface TodoChange {
    id: number;
    todo_id: number;
    message_id: number | null;
    file_path: string;
    change_type: 'added' | 'modified' | 'deleted';
    diff: string | null;
    created_at: string;
    updated_at: string;
}

export interface GitStatus {
    file: string;
    status: string;
    staged: boolean;
    unstaged: boolean;
    type: 'untracked' | 'added' | 'modified' | 'deleted' | 'renamed' | 'unknown';
}

export interface DirectoryEntry {
    name: string;
    path: string;
    isDirectory: boolean;
    isHidden: boolean;
    isGitRepo: boolean;
}

export interface BrowseResponse {
    path: string;
    parent: string;
    entries: DirectoryEntry[];
    isGitRepo: boolean;
    currentBranch: string | null;
}

export interface ClaudeSession {
    id: number;
    todo_id: number;
    process_id: string | null;
    session_key: string;
    status: 'starting' | 'running' | 'completed' | 'failed' | 'cancelled';
    last_error: string | null;
    started_at: string | null;
    completed_at: string | null;
    created_at: string;
    updated_at: string;
}

export type HookEvent =
    | 'before_change'
    | 'after_change'
    | 'task_started'
    | 'task_completed'
    | 'task_failed';

export interface Hook {
    id: string;
    directory_pattern: string;
    command: string;
    event: HookEvent;
    enabled: boolean;
}

export interface UserSettings {
    id: number;
    user_id: number | null;
    default_projects_directory: string | null;
    default_context: string | null;
    default_model: ClaudeModel;
    skip_permissions: boolean;
    auto_commit: boolean;
    show_hidden_files: boolean;
    hooks: Hook[];
    created_at: string;
    updated_at: string;
}

export interface McpServer {
    id: number;
    name: string;
    command: string;
    args: string[];
    env: Record<string, string>;
    enabled: boolean;
    type?: 'stdio' | 'http';
    url?: string;
    headers?: Record<string, string>;
    created_at: string;
    updated_at: string;
}

export interface QueuedMessage {
    id: number;
    todo_id: number;
    content: string;
    images: Array<{ data: string; mediaType: string }>;
    status: 'pending' | 'processing' | 'completed' | 'cancelled';
    queued_at: string;
    processed_at: string | null;
    created_at: string;
    updated_at: string;
}

export type PageProps<
    T extends Record<string, unknown> = Record<string, unknown>,
> = T & {};
