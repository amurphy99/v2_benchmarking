/* Title + subtitle + actions row.
--------------------------------------------------------------------------------
`frontend/src/pages/admin/components/ui/SectionHeader.tsx`

Used by ChatList sections, AnalysisPanel, the playback header, etc. Keeps 
headings consistent across all admin pages/views.
*/
import { ReactNode } from "react";

interface Props {
    title      : ReactNode;
    subtitle  ?: ReactNode;
    badge     ?: ReactNode;   // Small element rendered next to title (e.g. count pill)
    actions   ?: ReactNode;   // Right-aligned actions (refresh button, etc.)
    className ?: string;
}

// Title + subtitle + actions row
export function SectionHeader({ title, subtitle, badge, actions, className = "" }: Props) {
    return (
        <div className={`flex items-start justify-between gap-3 ${className}`}>
            <div className="min-w-0">
                <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold text-admin-text truncate">{title}</h2>
                    {badge}
                </div>
                {subtitle && <p className="text-sm text-admin-subtext mt-0.5">{subtitle}</p>}
            </div>
            {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
    );
}
