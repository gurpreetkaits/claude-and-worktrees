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
                                className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-sm text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700"
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
                                className="rounded-lg !my-3 !bg-gray-50 dark:!bg-gray-800 border border-gray-200 dark:border-gray-700"
                                customStyle={{
                                    margin: 0,
                                    padding: '0.75rem',
                                    fontSize: '0.875rem',
                                    background: resolvedTheme === 'dark' ? '#1f2937' : '#f9fafb',
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
                    return <li className="text-gray-700 dark:text-gray-300">{children}</li>;
                },
                h1({ children }) {
                    return <h1 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-100">{children}</h1>;
                },
                h2({ children }) {
                    return <h2 className="text-lg font-bold mb-2 text-gray-900 dark:text-gray-100">{children}</h2>;
                },
                h3({ children }) {
                    return <h3 className="text-base font-bold mb-2 text-gray-900 dark:text-gray-100">{children}</h3>;
                },
                a({ href, children }) {
                    return (
                        <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 dark:text-blue-400 hover:underline"
                        >
                            {children}
                        </a>
                    );
                },
                blockquote({ children }) {
                    return (
                        <blockquote className="border-l-2 border-gray-200 dark:border-gray-700 pl-4 my-3 text-gray-600 dark:text-gray-400 italic">
                            {children}
                        </blockquote>
                    );
                },
                table({ children }) {
                    return (
                        <div className="overflow-x-auto my-3">
                            <table className="min-w-full border border-gray-200 dark:border-gray-700 rounded">
                                {children}
                            </table>
                        </div>
                    );
                },
                th({ children }) {
                    return (
                        <th className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 text-left text-sm font-medium text-gray-900 dark:text-gray-100">
                            {children}
                        </th>
                    );
                },
                td({ children }) {
                    return (
                        <td className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300">
                            {children}
                        </td>
                    );
                },
                hr() {
                    return <hr className="my-4 border-gray-200 dark:border-gray-700" />;
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
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-500 dark:text-gray-400"
            title={copied ? 'Copied!' : 'Copy code'}
        >
            {copied ? (
                <svg className="w-3 h-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
            ) : (
                <CopyIcon className="w-3 h-3" />
            )}
        </button>
    );
}
