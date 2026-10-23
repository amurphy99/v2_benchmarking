/* Card frame shared by the participant and caregiver cards on the Accounts page.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/components/participants/EditableCard`

A card has two modes. Display mode ends with an Edit button. Edit mode outlines
the card and ends with Cancel and Save instead. The card that uses this frame
owns the draft and decides what each mode shows.

*/
import type { ReactElement, ReactNode } from "react";

// From this project
import { AdminButton } from "../ui/AdminButton";


// ================================================================================
// Editable Card
// ================================================================================
// Name header, the card's own body, and the Edit or Cancel/Save footer
export function EditableCard({name, username, badge, editing, canSave, saving, onEdit, onCancel, onSave, children}: {
    // Who the card is for
    name     : string;                  // Display name
    username : string;                  // Login name, shown as @username
    badge?   : ReactNode | undefined;   // Pill on the right of the name

    // Mode and footer actions
    editing  : boolean;                 // Edit mode is open
    canSave  : boolean;                 // The draft differs from what is saved
    saving   : boolean;                 // A save is running
    onEdit   : () => void;              // Open edit mode
    onCancel : () => void;              // Drop the draft and return to display mode
    onSave   : () => void;              // Send the draft

    // Body for the current mode
    children : ReactNode;
}): ReactElement {
    // Edit mode is outlined so it is clear which card holds unsaved changes
    const frame = editing ? "border-admin-accent ring-1 ring-admin-accent" : "border-admin-border";

    return (
        <div className={`h-full rounded-xl border ${frame} bg-admin-panel shadow-sm px-4 py-3 flex flex-col gap-3`}>
            {/* Name, username, and the optional badge */}
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-lg font-semibold text-admin-text truncate">{name}</div>
                    <div className="text-sm text-admin-subtext truncate">@{username}</div>
                </div>
                {badge}
            </div>

            {children}

            {/* Edit in display mode; Cancel and Save in edit mode */}
            <div className="mt-auto flex justify-end gap-2 pt-1">
                {editing ? (
                    <>
                        <AdminButton variant="outline" size="sm" onClick={onCancel} disabled={saving}>Cancel</AdminButton>
                        <AdminButton variant="primary" size="sm" onClick={onSave}   disabled={!canSave || saving}>{saving ? "Saving..." : "Save"}</AdminButton>
                    </>
                ) : (
                    <AdminButton variant="outline" size="sm" onClick={onEdit}>Edit</AdminButton>
                )}
            </div>
        </div>
    );
}
