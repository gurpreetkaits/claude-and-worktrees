import { SlashCommand, SLASH_COMMANDS } from './SlashCommands';

// Command execution context
export interface CommandContext {
    todoId: number;
    worktreePath?: string;
    sendMessage: (content: string) => void;
    clearMessages?: () => void;
    showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
    costUsd?: number | null;
    durationMs?: number | null;
    toolUses?: Array<{ tool: string }>;
    messages?: Array<{ role: string; content: string }>;
}

// Command execution result
export interface CommandResult {
    handled: boolean;
    message?: string;
    error?: string;
}

// Command handlers
type CommandHandler = (args: string, context: CommandContext) => Promise<CommandResult> | CommandResult;

const commandHandlers: Record<string, CommandHandler> = {
    // Help command - show available commands
    help: () => {
        return {
            handled: true,
            message: `Available commands:

**General**
- \`/help\` - Show this help message
- \`/clear\` - Clear conversation history
- \`/compact\` - Summarize and compact the conversation

**Code**
- \`/search <query>\` - Search for files or code
- \`/read <path>\` - Read a specific file
- \`/edit <path>\` - Edit a specific file
- \`/review\` - Review recent code changes

**Git**
- \`/status\` - Show git status
- \`/diff\` - Show uncommitted changes
- \`/commit [message]\` - Commit with AI-generated message
- \`/pr [title]\` - Create a pull request

**Session**
- \`/cost\` - Show session cost and duration
- \`/context\` - Show context window usage`,
        };
    },

    // Clear command
    clear: (_, context) => {
        if (context.clearMessages) {
            context.clearMessages();
            return { handled: true, message: 'Conversation cleared.' };
        }
        return { handled: false, error: 'Clear not available' };
    },

    // Compact command - summarize conversation
    compact: (_, context) => {
        context.sendMessage('Please summarize our conversation so far in a concise format, highlighting the key points, decisions made, and any pending tasks.');
        return { handled: true };
    },

    // Search command
    search: (args, context) => {
        if (!args.trim()) {
            return { handled: true, message: 'Usage: `/search <query>` - Search for files or code patterns' };
        }
        context.sendMessage(`Search the codebase for: ${args.trim()}`);
        return { handled: true };
    },

    // Read command
    read: (args, context) => {
        if (!args.trim()) {
            return { handled: true, message: 'Usage: `/read <filepath>` - Read and display a file' };
        }
        context.sendMessage(`Read the file: ${args.trim()}`);
        return { handled: true };
    },

    // Edit command
    edit: (args, context) => {
        if (!args.trim()) {
            return { handled: true, message: 'Usage: `/edit <filepath>` - Open a file for editing discussion' };
        }
        context.sendMessage(`Let's edit the file: ${args.trim()}. What changes would you like to make?`);
        return { handled: true };
    },

    // Review command
    review: (_, context) => {
        context.sendMessage('Please review the recent code changes. Look for bugs, security issues, performance problems, and suggest improvements.');
        return { handled: true };
    },

    // Git status command
    status: (_, context) => {
        context.sendMessage('Show me the current git status. List modified, staged, and untracked files.');
        return { handled: true };
    },

    // Git diff command
    diff: (args, context) => {
        if (args.trim()) {
            context.sendMessage(`Show the git diff for: ${args.trim()}`);
        } else {
            context.sendMessage('Show me the git diff of all uncommitted changes.');
        }
        return { handled: true };
    },

    // Commit command
    commit: (args, context) => {
        if (args.trim()) {
            context.sendMessage(`Create a git commit with this message: "${args.trim()}". Stage the appropriate files first.`);
        } else {
            context.sendMessage('Review the changes and create a git commit with an appropriate commit message following conventional commit format.');
        }
        return { handled: true };
    },

    // PR command
    pr: (args, context) => {
        if (args.trim()) {
            context.sendMessage(`Create a pull request with title: "${args.trim()}". Write a good description summarizing the changes.`);
        } else {
            context.sendMessage('Create a pull request for the current branch. Generate a good title and description based on the commits.');
        }
        return { handled: true };
    },

    // Cost command
    cost: (_, context) => {
        const cost = context.costUsd !== null && context.costUsd !== undefined
            ? `$${context.costUsd.toFixed(4)}`
            : 'Not available';
        const duration = context.durationMs !== null && context.durationMs !== undefined
            ? `${(context.durationMs / 1000).toFixed(1)}s`
            : 'Not available';
        const tools = context.toolUses?.length || 0;

        return {
            handled: true,
            message: `**Session Statistics**
- **Cost**: ${cost}
- **Duration**: ${duration}
- **Tool calls**: ${tools}`,
        };
    },

    // Context command
    context: (_, context) => {
        const messageCount = context.messages?.length || 0;
        const userMessages = context.messages?.filter(m => m.role === 'user').length || 0;
        const assistantMessages = context.messages?.filter(m => m.role === 'assistant').length || 0;

        // Rough token estimate (very approximate)
        const totalChars = context.messages?.reduce((sum, m) => sum + m.content.length, 0) || 0;
        const estimatedTokens = Math.round(totalChars / 4);

        return {
            handled: true,
            message: `**Context Usage**
- **Total messages**: ${messageCount}
- **User messages**: ${userMessages}
- **Assistant messages**: ${assistantMessages}
- **Estimated tokens**: ~${estimatedTokens.toLocaleString()}`,
        };
    },
};

// Execute a slash command
export async function executeCommand(
    command: SlashCommand,
    fullInput: string,
    context: CommandContext
): Promise<CommandResult> {
    const handler = commandHandlers[command.name];

    if (!handler) {
        // Unknown command - just send as message
        context.sendMessage(fullInput);
        return { handled: true };
    }

    // Extract arguments (everything after the command name)
    const commandPattern = new RegExp(`^\\s*/\\s*${command.name}\\s*`, 'i');
    const args = fullInput.replace(commandPattern, '').trim();

    try {
        return await handler(args, context);
    } catch (error) {
        return {
            handled: false,
            error: error instanceof Error ? error.message : 'Command failed',
        };
    }
}

// Check if input starts with a command and extract it
export function parseCommand(input: string): { command: string; args: string } | null {
    const match = input.trim().match(/^\/(\S+)(?:\s+(.*))?$/);
    if (!match) return null;

    return {
        command: match[1].toLowerCase(),
        args: match[2] || '',
    };
}

// Get command by name
export function getCommandByName(name: string): SlashCommand | null {
    return SLASH_COMMANDS.find((cmd) => cmd.name.toLowerCase() === name.toLowerCase()) || null;
}
