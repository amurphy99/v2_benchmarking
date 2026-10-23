import { ReactNode } from "react";

interface Props {
    children    : ReactNode;
    header     ?: ReactNode;
    actions    ?: ReactNode;
    className  ?: string;
    bodyClass  ?: string;
    padded     ?: boolean;
}

// Standardized style definition for content on the Admin pages
export function AdminCard({ children, header, actions, className = "", bodyClass = "", padded = true }: Props) {
    const showHeader = header !== undefined || actions !== undefined;
    return (
        <section className={`bg-admin-panel border border-admin-border rounded-xl shadow-sm overflow-hidden ${className}`}>
            {showHeader && (
                <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-admin-border">
                    <div className="min-w-0">{header}</div>
                    {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
                </header>
            )}
            <div className={`${padded ? "p-4" : ""} ${bodyClass}`}>
                {children}
            </div>
        </section>
    );
}
