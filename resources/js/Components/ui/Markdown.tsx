import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useTheme } from '@/contexts/ThemeContext';
import { CopyIcon } from './Icons';
import { useState } from 'react';

interface MarkdownProps {
    content: string;
    className?: string;
}

export function Markdown({ content, className = '' }: MarkdownProps) {
    const { resolvedTheme } = useTheme();
    const syntaxTheme = resolvedTheme === 'dark' ? oneDark : oneLight;

    return (
        <div className={`markdown-content ${className}`}>
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
                code({ node, className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || '');
                    const isInline = !match && !String(children).includes('\n');

                    if (isInline) {
                        return (
                            <code
                                className="bg-bg-muted px-1.5 py-0.5 rounded text-sm text-fg border border-border font-mono"
                                {...props}
                            >
                                {children}
                            </code>
                        );
                    }

                    return (
                        <div className="relative group">
                            <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <CopyButton text={String(children).replace(/\n$/, '')} />
                            </div>
                            <SyntaxHighlighter
                                style={syntaxTheme}
                                language={match ? match[1] : 'text'}
                                PreTag="div"
                                className="rounded-xl !my-3 !bg-bg-muted border border-border"
                                customStyle={{
                                    margin: 0,
                                    padding: '0.75rem',
                                    fontSize: '0.875rem',
                                    background: resolvedTheme === 'dark' ? 'rgb(23, 23, 23)' : 'rgb(245, 245, 245)',
                                }}
                            >
                                {String(children).replace(/\n$/, '')}
                            </SyntaxHighlighter>
                        </div>
                    );
                },
                p({ children }) {
                    return <p className="mb-3 last:mb-0">{children}</p>;
                },
                ul({ children }) {
                    return <ul className="list-disc pl-5 mb-3 space-y-2">{children}</ul>;
                },
                ol({ children }) {
                    return <ol className="list-decimal pl-5 mb-3 space-y-2">{children}</ol>;
                },
                li({ children }) {
                    return <li className="text-fg-secondary">{children}</li>;
                },
                h1({ children }) {
                    return <h1 className="text-xl font-bold mb-3 text-fg">{children}</h1>;
                },
                h2({ children }) {
                    return <h2 className="text-lg font-bold mb-2 text-fg">{children}</h2>;
                },
                h3({ children }) {
                    return <h3 className="text-base font-bold mb-2 text-fg">{children}</h3>;
                },
                a({ href, children }) {
                    return (
                        <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-fg hover:text-fg-secondary hover:underline"
                        >
                            {children}
                        </a>
                    );
                },
                blockquote({ children }) {
                    return (
                        <blockquote className="border-l-2 border-border pl-4 my-3 text-fg-muted italic">
                            {children}
                        </blockquote>
                    );
                },
                table({ children }) {
                    return (
                        <div className="overflow-x-auto my-3">
                            <table className="min-w-full border border-border rounded">
                                {children}
                            </table>
                        </div>
                    );
                },
                th({ children }) {
                    return (
                        <th className="px-3 py-2 bg-bg-muted border-b border-border text-left text-sm font-medium text-fg">
                            {children}
                        </th>
                    );
                },
                td({ children }) {
                    return (
                        <td className="px-3 py-2 border-b border-border text-sm text-fg-secondary">
                            {children}
                        </td>
                    );
                },
                hr() {
                    return <hr className="my-4 border-border" />;
                },
            }}
        >
            {content}
        </ReactMarkdown>
        </div>
    );
}

// Copy button component
function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <button
            onClick={handleCopy}
            className="p-1 hover:bg-bg-muted rounded text-fg-muted"
            title={copied ? 'Copied!' : 'Copy code'}
        >
            {copied ? (
                <svg className="w-3 h-3 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
            ) : (
                <CopyIcon className="w-3 h-3" />
            )}
        </button>
    );
}
