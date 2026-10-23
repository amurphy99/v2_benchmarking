/* Admin page for each participant's web avatar and recording default.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/AdminParticipants`

Lists every participant as a card, most recent chat first. A participant is a
patient profile; caregivers own no profile, so they never appear. A card's
Edit settings button opens a modal, and nothing is saved until its Save button.
Opened from the main admin page at `/admin/participants`.

*/
import type { ReactElement } from "react";
import      { useState     } from "react";
import      { useNavigate  } from "react-router-dom";

// From this project
import type { AdminProfile, UpdateAdminProfilePayload } from "@/api";
import      { useAdminProfiles, useUpdateAdminProfile } from "@/hooks/queries/useAdminProfiles";
import      { ParticipantCard                         } from "./components/participants/ParticipantCard";
import      { ParticipantSettingsModal                } from "./components/participants/ParticipantSettingsModal";
import      { AdminPage                               } from "./components/ui/AdminPage";
import      { SectionHeader                           } from "./components/ui/SectionHeader";


// ================================================================================
// Admin Participants
// ================================================================================
// Card grid of participants, with a modal for changing one participant's settings
export function AdminParticipants(): ReactElement {
    const navigate = useNavigate();

    // Participants, and the save that changes one of them
    const {data: participants, isLoading} = useAdminProfiles();
    const updateParticipant                = useUpdateAdminProfile();

    // Participant whose settings modal is open (null while it is closed)
    const [editing, setEditing] = useState<AdminProfile | null>(null);

    // Save the modal's settings and close it once they are saved (a failed save keeps it open)
    const save = (participant: AdminProfile, body: UpdateAdminProfilePayload): void => {
        updateParticipant.mutate({id: participant.id, body}, {onSuccess: () => setEditing(null)});
    };

    return (
        <AdminPage>
            <div className="flex flex-col gap-6 pt-6">
                {/* Back link and page title */}
                <div className="bg-admin-panel border border-admin-border rounded-xl shadow-sm p-4">
                    <button className="text-sm text-admin-subtext hover:text-admin-text transition-colors mb-4 w-fit cursor-pointer" onClick={() => navigate("/admin")}>
                        ← Back to Admin
                    </button>
                    <SectionHeader
                        title    = "Participant Settings"
                        subtitle = "Choose each participant's avatar and whether their chat audio is saved automatically. Changes apply from their next chat."
                    />
                </div>

                {/* One card per participant */}
                {isLoading ? (
                    <p className="text-sm text-admin-subtext">Loading participants...</p>
                ) : (participants.length === 0) ? (
                    <p className="text-sm text-admin-subtext">No participants yet. Each patient account that signs up appears here.</p>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {participants.map((participant: AdminProfile) => (
                            <ParticipantCard key={participant.id} participant={participant} onEdit={() => setEditing(participant)} />
                        ))}
                    </div>
                )}
            </div>

            {/* Settings modal for the participant being edited */}
            {(editing !== null) ? (
                <ParticipantSettingsModal
                    key         = {editing.id}
                    participant = {editing}
                    saving      = {updateParticipant.isPending}
                    onSave      = {(body: UpdateAdminProfilePayload) => save(editing, body)}
                    onClose     = {() => setEditing(null)}
                />
            ) : null}
        </AdminPage>
    );
}
