import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface MarkdownProps {
    content: string;
    className?: string;
}

export function Markdown({ content, className = '' }: MarkdownProps) {
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
                            <code className="inline-code" {...props}>
                                {children}
                            </code>
                        );
                    }

                    return (
                        <SyntaxHighlighter
                            style={oneDark}
                            language={match ? match[1] : 'text'}
                            PreTag="div"
                            className="rounded-lg !my-3"
                            customStyle={{
                                margin: 0,
                                padding: '1rem',
                                fontSize: '0.875rem',
                            }}
                        >
                            {String(children).replace(/\n$/, '')}
                        </SyntaxHighlighter>
                    );
                },
                p({ children }) {
                    return <p className="mb-3 last:mb-0">{children}</p>;
                },
                ul({ children }) {
                    return <ul className="list-disc pl-5 mb-3 space-y-1">{children}</ul>;
                },
                ol({ children }) {
                    return <ol className="list-decimal pl-5 mb-3 space-y-1">{children}</ol>;
                },
                li({ children }) {
                    return <li className="text-text-high">{children}</li>;
                },
                h1({ children }) {
                    return <h1 className="text-xl font-bold mb-3 text-text-high">{children}</h1>;
                },
                h2({ children }) {
                    return <h2 className="text-lg font-bold mb-2 text-text-high">{children}</h2>;
                },
                h3({ children }) {
                    return <h3 className="text-base font-bold mb-2 text-text-high">{children}</h3>;
                },
                a({ href, children }) {
                    return (
                        <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brand hover:underline"
                        >
                            {children}
                        </a>
                    );
                },
                blockquote({ children }) {
                    return (
                        <blockquote className="border-l-4 border-brand/50 pl-4 my-3 text-text-low italic">
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
                        <th className="px-3 py-2 bg-bg-panel border-b border-border text-left text-sm font-medium text-text-high">
                            {children}
                        </th>
                    );
                },
                td({ children }) {
                    return (
                        <td className="px-3 py-2 border-b border-border text-sm text-text-normal">
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
