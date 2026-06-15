/* Audio from chats with transcript playback controls & biomarker highlighting.
--------------------------------------------------------------------------------
`frontend/src/pages/transcript_playback/TranscriptPlayback.tsx`

This is the second analysis page. It might be more aptly named "Biomarker 
Highlights", but that is a potential change we could make later. This page again
shows admin users the full transcript from the chat, however on this version
they can view each message of the chat from the "perspective" of the different
biomarkers our app extracts. So the select one of these biomarkers from a
dropdown, and then all of the user's messages within the transcript are
highlighted based on the presence/severity of any biomarker scores. Worse scores
are highlighted darker, while better scores are highlighted in a much lighter
color. 

Additionally, for chats where we recorded and saved the audio, we have an audio
player at the top of the page that they can scroll through as they want and
clicking on any word or utterance in the transcript will automatically move the
playback time to that area of the transcript. This allows admin users to examine
certain biomarker scores in much more precise detail.

NOTE: Admin users navigate here from AdminChatInactive with: 
  `state: { sessionId: number }`
We pass the session ID rather than the session object so that we can re-fetch 
the session here, which helps make sure `audio_file` is the newest value saved
by the backend (there could be cases where it takes a second to save it but we
already navigated to the post-chat analysis page).

*/
import { useRef, useState, useEffect } from "react";
import { useLocation, useNavigate    } from "react-router-dom";
import { LuArrowLeft, LuColumns2     } from "react-icons/lu";

// From this project
import { API_URL        } from "@/utils/constants";
import { dateFormatLong } from "@/utils/styling/numFormatting";
import { useChatSession } from "@/hooks/queries/useChatSessions";
import { getAccess      } from "@/context/AuthProvider";

// Components
import AudioPlayer        from "./components/AudioPlayer";
import BiomarkerSelector  from "./components/BiomarkerSelector";
import BiomarkerStatsBar  from "./components/BiomarkerStatsBar";
import SeverityLegend     from "./components/SeverityLegend";
import PlaybackTranscript from "./components/PlaybackTranscript";
import { AdminPage            } from "@/pages/admin/components/ui/AdminPage";
import { AdminButton          } from "@/pages/admin/components/ui/AdminButton";
import { BiomarkerInfoModal   } from "@/pages/admin/components/biomarkers/BiomarkerInfoModal";
import { getBiomarkerInfo     } from "@/pages/admin/components/biomarkers/biomarkerInfo";
import { BiomarkerInfoContext } from "./biomarkers/BiomarkerInfoContext";

const SCORE_RAIL_KEY = "admin.playback.scoreRail";

// ================================================================================
// TranscriptPlayback
// ================================================================================
// Plays a recorded session's audio while highlighting the currently-spoken word in 
// the transcript. Word-level timestamps are stored as absolute datetimes and 
// converted to audio offsets at render time via `sessionStartMs`.
export function TranscriptPlayback() {
    // Pass the ChatSession's ID as `state.sessionId` when navigating here
    const navigate = useNavigate();

    // Accept either a sessionId (new) or a full chatSession object (legacy fallback)
    const { state } = useLocation() as { state?: { sessionId?: number; chatSession?: any } };
    const sessionId = state?.sessionId ?? state?.chatSession?.id;

    // Always fetch fresh from DB so audio_file is the most recent copy
    const { data: session, isLoading } = useChatSession(sessionId ? String(sessionId) : "");

    // If no ID was passed at all, send the user back to the last page
    if (!sessionId) { navigate("/history"); return null; }

    // --------------------------------------------------------------------------------
    // Biomarker Selection (score info + modal with explanation)
    // --------------------------------------------------------------------------------
    // Current selected biomarker
    const [selectedBiomarker, setSelectedBiomarker] = useState("");
    const [   modalBiomarker,    setModalBiomarker] = useState<string | null>(null);
    const openInfo = (type: string) => setModalBiomarker(type);

    // Score rail controls
    const [showScoreRail, setShowScoreRail] = useState<boolean>(() => {
        try { return localStorage.getItem(SCORE_RAIL_KEY) === "true"; } catch { return false; }
    });
    useEffect(() => {
        try { localStorage.setItem(SCORE_RAIL_KEY, String(showScoreRail)); } catch { /* ignore */ }
    }, [showScoreRail]);

    // --------------------------------------------------------------------------------
    // Audio Setup
    // --------------------------------------------------------------------------------
    // 1) Create the audio player
    const audioRef = useRef<HTMLAudioElement>(null);
    const [currentTime,       setCurrentTime      ] = useState(0);

    // 2) Derive audio URL from the fetched session
    // Append the JWT access token as a query param so the backend can
    // authenticate the request (the <audio> element cannot send headers).
    const MEDIA_BASE = API_URL.replace(/\/api\/?$/, "");
    const audioUrl   = session.audio_file
        ? `${MEDIA_BASE}/media/${session.audio_file}?token=${getAccess()}`
        : undefined;
    
    // 3) Get the timestamps for seeking
    // We set zero-time to the wall-clock time when the first chunk of audio was
    // received from the user. So word.start_ts - audio_start_ts should give the
    // correct byte offset into the audio file for seeking. For sessions recorded
    // before this field existed, we just use the old 'start_ts' field.
    const sessionStartMs        = new Date(session.audio_start_ts ?? session.start_ts).getTime();
    const selectedBiomarkerInfo = selectedBiomarker ? getBiomarkerInfo(selectedBiomarker) : null;

    // Utility function that seeks through the audio file to wherever the word we clicked on was
    const onSeek = (sec: number) => {
        if (audioRef.current) audioRef.current.currentTime = sec;
    };

    // --------------------------------------------------------------------------------
    // Final Page Setup
    // --------------------------------------------------------------------------------
    // Loading & error states
    if (isLoading || !session?.id) {
        return (
            <AdminPage>
                <div className="flex items-center justify-center h-[40vh] text-admin-subtext">
                    Loading session…
                </div>
            </AdminPage>
        );
    }

    // Patient name comes from the session's profile
    const patientName = `${session.profile.account.user.first_name} ${session.profile.account.user.last_name}`;


    // ================================================================================
    // Return Page UI
    // ================================================================================
    return (
        <BiomarkerInfoContext.Provider value={openInfo}>
            <AdminPage contained={false}>

                {/* ================================================================================ */}
                {/* Header (sticky) */}
                {/* ================================================================================ */}
                <header className="sticky top-0 z-10 bg-admin-panel/95 backdrop-blur border-b border-admin-border">

                    {/* -------------------------------------------------------------------------------- */}
                    {/* Row 1 => Back Button | Page Title + Date/Speaker | Biomarker Dropdown + Stats */}
                    {/* -------------------------------------------------------------------------------- */}
                    <div className="flex items-center gap-4 px-4 md:px-6 py-3 flex-wrap">

                        {/* Back Button */}
                        <button
                            onClick   = {() => navigate(-1)}
                            className = "flex items-center justify-center h-8 w-8 rounded-md text-admin-text hover:bg-admin-muted cursor-pointer"
                            aria-label = "Back"
                        >
                            <LuArrowLeft size={20} />
                        </button>

                        {/* Page Title & Subtitle Info */}
                        <div className="flex items-baseline gap-3 flex-wrap">
                            <h1 className="text-xl md:text-2xl font-semibold text-admin-text">
                                Speech Pattern Analysis
                            </h1>

                            {/* Chat Date */}
                            <span className="text-sm text-admin-subtext">
                                {dateFormatLong.format(new Date(session.date))} — {patientName}
                            </span>
                        </div>

                        {/* Biomarker Selection + Score Stats (right side) */}
                        <div className="ml-auto flex items-center gap-3 flex-wrap">
                            <BiomarkerSelector
                                biomarkers        = {session.biomarkers}
                                selectedBiomarker = {selectedBiomarker}
                                onChange          = {setSelectedBiomarker}
                                onInfoClick       = {openInfo}
                            />
                            <BiomarkerStatsBar
                                biomarkers        = {session.biomarkers}
                                selectedBiomarker = {selectedBiomarker}
                            />
                        </div>
                    </div>

                    {/* -------------------------------------------------------------------------------- */}
                    {/* Row 2 => Audio Player | Score Rail Toggle */}
                    {/* -------------------------------------------------------------------------------- */}
                    <div className="grid grid-cols-4 items-center gap-4 px-4 md:px-6 py-3 border-t border-admin-border">

                        {/* Left spacer to balance the grid and keep the center item perfectly centered */}
                        <div className="hidden sm:block" />

                        {/* Audio Player (or a short note when no audio was recorded) */}
                        <div className="col-span-2 flex-1 min-w-0">
                            {audioUrl ? (
                                <AudioPlayer
                                    audioRef     = {audioRef}
                                    src          = {audioUrl}
                                    onTimeUpdate = {() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
                                />
                            ) : (
                                <span className="text-sm text-admin-subtext">
                                    No audio for this session — recording must be enabled by an admin before the chat ends.
                                </span>
                            )}
                        </div>

                        {/* Score Rail Toggle */}
                        <div className="justify-self-end shrink-0">
                            <AdminButton
                                variant ={showScoreRail ? "primary" : "outline"}
                                size     = "sm"
                                iconLeft = {<LuColumns2 size={14} />}
                                onClick  = {() => setShowScoreRail(v => !v)}
                            >
                                Score rail
                            </AdminButton>
                        </div>
                    </div>
                </header>

                {/* ================================================================================ */}
                {/* Body => Active biomarker key (badge + severity legend) | Transcript Display */}
                {/* ================================================================================ */}
                {/* Active biomarker badge + severity color key (only while a biomarker is selected) */}
                {selectedBiomarker && (
                    <div className="mx-auto max-w-[900px] px-4 md:px-6 pt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
                        {selectedBiomarkerInfo && (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-admin-accentSoft border border-admin-accent/30 px-3 py-1 text-base font-medium text-admin-accent2">
                                <span className="text-admin-accent">·</span>
                                {selectedBiomarkerInfo.name}
                            </span>
                        )}
                        <SeverityLegend />
                    </div>
                )}

                {/* Transcript */}
                <PlaybackTranscript
                    messages          = {session.messages}
                    biomarkers        = {session.biomarkers}
                    sessionStartMs    = {sessionStartMs}
                    currentTime       = {currentTime}
                    selectedBiomarker = {selectedBiomarker}
                    userName          = {patientName}
                    onSeek            = {onSeek}
                    showScoreRail     = {showScoreRail && !!selectedBiomarker}
                />

                {/* Hidden Modal */}
                <BiomarkerInfoModal
                    isOpen        = {modalBiomarker !== null}
                    biomarkerType = {modalBiomarker}
                    onClose       = {() => setModalBiomarker(null)}
                />

            </AdminPage>
        </BiomarkerInfoContext.Provider>
    );
}

