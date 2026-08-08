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
the latest `SessionAudio` metadata after the backend finishes saving it.

*/
import { useRef, useState, useEffect } from "react";
import { useLocation, useNavigate    } from "react-router-dom";
import { LuArrowLeft                 } from "react-icons/lu";

// From this project
import { dateFormatLong } from "@/utils/styling/numFormatting";
import { useChatSession, useSessionAudioPlayback } from "@/hooks/queries/useChatSessions";

// Components
import AudioPlayer         from "./components/AudioPlayer";
import BiomarkerSelector   from "./components/BiomarkerSelector";
import BiomarkerSidePanel  from "./components/BiomarkerSidePanel";
import PlaybackTranscript  from "./components/PlaybackTranscript";
import { AdminPage            } from "@/pages/admin/components/ui/AdminPage";
import { BiomarkerInfoModal   } from "@/pages/admin/components/biomarkers/BiomarkerInfoModal";
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

    // Always fetch fresh from DB so recording metadata is the most recent copy
    const { data: session, isLoading } = useChatSession         (sessionId ? String(sessionId) : "");
    const { data: playback           } = useSessionAudioPlayback(sessionId ? String(sessionId) : "", Boolean(session?.audio));

    // If no ID was passed at all, send the user back without navigating during render
    useEffect(() => { if (!sessionId) navigate("/history"); }, [sessionId, navigate]);

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

    // --------------------------------------------------------------------------------
    // Final Page Setup
    // --------------------------------------------------------------------------------
    // Loading & error states
    if ((!sessionId) || isLoading || !session?.id) {
        return (
            <AdminPage>
                <div className="flex items-center justify-center h-[40vh] text-admin-subtext">
                    Loading session…
                </div>
            </AdminPage>
        );
    }

    // Use a short-lived URL issued only after the REST API authorizes this user
    const audioUrl = playback.url || undefined;

    // The audio row owns the recording's wall-clock anchor. Legacy rows without an
    // anchor fall back to the earliest transcript/biomarker timestamp.
    const sessionStartMs = new Date(session.audio?.started_at ?? session.start_ts).getTime();

    // Seek the recording to the transcript-relative offset selected by the user
    const onSeek = (sec: number) => {
        if (audioRef.current) audioRef.current.currentTime = sec;
    };

    // Patient name comes from the session's profile
    const patientName = `${session.profile.account.user.first_name} ${session.profile.account.user.last_name}`;


    // ================================================================================
    // Return Page UI
    // ================================================================================
    return (
        <BiomarkerInfoContext.Provider value={openInfo}>
            <AdminPage contained={false}>

                {/* ================================================================================ */}
                {/* Header(s) */}
                {/* ================================================================================ */}

                {/* -------------------------------------------------------------------------------- */}
                {/* Row 1  => Back | Title + Date/Speaker | Highlight dropdown* */}
                {/* -------------------------------------------------------------------------------- */}
                {/* NOT sticky -> scrolls away
                    dropdown only shows here for the initial pick; once selected it stays in the side panel */}
                <div className="bg-admin-panel border-b border-admin-border">
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

                        {/* Highlight dropdown -- initial pick only (moves into the side panel once selected) */}
                        {!selectedBiomarker && (
                            <div className="ml-auto">
                                <BiomarkerSelector
                                    biomarkers        = {session.biomarkers}
                                    selectedBiomarker = {selectedBiomarker}
                                    onChange          = {setSelectedBiomarker}
                                    onInfoClick       = {openInfo}
                                />
                            </div>
                        )}
                    </div>
                </div>

                {/* -------------------------------------------------------------------------------- */}
                {/* Row 2 (stays pinned) => Audio Player, centered */}
                {/* -------------------------------------------------------------------------------- */}
                <header className="sticky top-0 z-10 bg-admin-panel/95 backdrop-blur border-b border-admin-border">
                    <div className="grid grid-cols-4 items-center gap-4 px-4 md:px-6 py-3">

                        {/* Spacers keep the audio control centered (hidden on small screens) */}
                        <div className="hidden sm:block" />

                        {/* Audio Player (or a short note when no audio was recorded) */}
                        <div className="col-span-4 sm:col-span-2 min-w-0">
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

                        <div className="hidden sm:block" />
                    </div>
                </header>

                {/* ================================================================================ */}
                {/* Body => Biomarker side panel (left) + Transcript */}
                {/* ================================================================================ */}

                {/* -------------------------------------------------------------------------------- */}
                {/* Side Panel */}
                {/* -------------------------------------------------------------------------------- */}
                {/* Narrow screens: the panel collapses to an inline bar at the top */}
                {selectedBiomarker && (
                    <div className="xl:hidden mx-auto max-w-[900px] px-4 md:px-6 pt-3">
                        <BiomarkerSidePanel
                            layout            = "inline"
                            biomarkers        = {session.biomarkers}
                            selectedBiomarker = {selectedBiomarker}
                            onChange          = {setSelectedBiomarker}
                            onInfoClick       = {openInfo}
                            showScoreRail     = {showScoreRail}
                            onToggleScoreRail = {() => setShowScoreRail(v => !v)}
                        />
                    </div>
                )}

                {/* Wide screens (xl+): 
                    The 3-column grid [1fr | transcript | 1fr] keeps the transcript centered on the 
                    page (like the audio controls). The side panel goes into the LEFT column, 
                    right-aligned so it hugs the transcript; the empty right 1fr balances it. Below 
                    xl size it's normal block flow + the inline bar above.
                */}
                <div className="px-4 md:px-6 xl:grid xl:grid-cols-[1fr_auto_1fr] xl:gap-4 xl:px-0">

                    {/* Left gutter: side panel, right-aligned to hug the transcript */}
                    {selectedBiomarker && (
                        <aside className="hidden xl:block xl:col-start-1 justify-self-end w-[360px] pt-6">
                            <div className="sticky top-24">
                                <BiomarkerSidePanel
                                    layout            = "side"
                                    biomarkers        = {session.biomarkers}
                                    selectedBiomarker = {selectedBiomarker}
                                    onChange          = {setSelectedBiomarker}
                                    onInfoClick       = {openInfo}
                                    showScoreRail     = {showScoreRail}
                                    onToggleScoreRail = {() => setShowScoreRail(v => !v)}
                                />
                            </div>
                        </aside>
                    )}

                    {/* -------------------------------------------------------------------------------- */}
                    {/* Transcript */}
                    {/* -------------------------------------------------------------------------------- */}
                    {/* Middle column (col-start-2) -> stays centered whether or not the panel is shown.
                        Capped to its own width; mx-auto centers it on small screens (no grid). */}
                    <main className={`xl:col-start-2 w-full min-w-0 mx-auto ${showScoreRail && selectedBiomarker ? "max-w-[1200px]" : "max-w-[900px]"}`}>
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
                    </main>

                </div>

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
