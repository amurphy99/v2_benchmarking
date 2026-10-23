/* One caregiver's card on the admin accounts page.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/components/participants/CaregiverCard`

Shows the participants linked to the caregiver as chips. Removing a chip, or
picking a participant from the dropdown, saves the caregiver's whole new set of
links right away. The caregiver's Monitor pages show only these participants.

*/
import type { ChangeEvent, ReactElement } from "react";
import      { LuX                       } from "react-icons/lu";

// From this project
import type { AdminCaregiver, AdminProfile, LinkedParticipant } from "@/api";
import      { participantName                                 } from "./ParticipantCard";


// ================================================================================
// Caregiver Card
// ================================================================================
// Card with the caregiver's name, their linked participants, and a dropdown to link one more
export function CaregiverCard({caregiver, participants, saving, onChange}: {
    caregiver    : AdminCaregiver;                       // Caregiver shown
    participants : AdminProfile[];                       // Every participant (the dropdown offers the unlinked ones)
    saving       : boolean;                              // A link change is running
    onChange     : (participantIds: number[]) => void;   // Save the caregiver's whole new set of links
}): ReactElement {
    // Profile IDs already linked, and the participants that could be added
    const linkedIds = caregiver.participants.map((linked: LinkedParticipant) => linked.id);
    const unlinked  = participants.filter((participant: AdminProfile) => !linkedIds.includes(participant.id));

    return (
        <div className="h-full rounded-xl border border-admin-border bg-admin-panel shadow-sm px-4 py-3 flex flex-col gap-3">
            {/* Name and username */}
            <div className="min-w-0">
                <div className="text-lg font-semibold text-admin-text truncate">{participantName(caregiver.user)}</div>
                <div className="text-sm text-admin-subtext truncate">@{caregiver.user.username}</div>
            </div>

            {/* Linked participants, each with a remove button */}
            <div className="flex gap-2 flex-wrap">
                {(caregiver.participants.length === 0) ? <span className="text-sm text-admin-subtext">No participants linked yet</span> : null}
                {caregiver.participants.map((linked: LinkedParticipant) => (
                    <span key={linked.id} className="inline-flex items-center gap-1 rounded-full border border-admin-border bg-admin-muted pl-3 pr-1 py-0.5 text-sm text-admin-text">
                        {participantName(linked.user)}
                        <button
                            onClick    = {() => onChange(linkedIds.filter((id: number) => id !== linked.id))}
                            disabled   = {saving}
                            aria-label = {`Unlink ${participantName(linked.user)}`}
                            className  = "p-0.5 rounded-full text-admin-subtext hover:text-admin-text hover:bg-admin-panel cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <LuX size={14} />
                        </button>
                    </span>
                ))}
            </div>

            {/* Link one more participant (the dropdown always resets to its prompt) */}
            <select
                value     = ""
                disabled  = {saving || (unlinked.length === 0)}
                onChange  = {(event: ChangeEvent<HTMLSelectElement>) => onChange([...linkedIds, Number(event.target.value)])}
                className = "mt-auto w-full rounded-md border border-admin-border bg-admin-panel px-3 py-2 text-sm text-admin-text disabled:opacity-50"
            >
                <option value="" disabled>{(unlinked.length === 0) ? "Every participant is linked" : "Link a participant..."}</option>
                {unlinked.map((participant: AdminProfile) => (
                    <option key={participant.id} value={participant.id}>{participantName(participant.user)} (@{participant.user.username})</option>
                ))}
            </select>
        </div>
    );
}
