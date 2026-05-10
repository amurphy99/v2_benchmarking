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

*/
import { useRef, useState, useEffect } from "react";
import { useLocation, useNavigate    } from "react-router-dom";
import { LuArrowLeft, LuColumns2     } from "react-icons/lu";

// From this project
import { ChatSession    } from "@/api";
import { API_URL        } from "@/utils/constants";
import { dateFormatLong } from "@/utils/styling/numFormatting";

// Components
import AudioPlayer        from "./components/AudioPlayer";
import BiomarkerSelector  from "./components/BiomarkerSelector";
import BiomarkerStatsBar  from "./components/BiomarkerStatsBar";
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
    // Pass the ChatSession as `state.chatSession` when navigating here
    const navigate = useNavigate();
    const { state } = useLocation() as { state?: { chatSession?: ChatSession } };
    const session = state?.chatSession;
    if (!session) { navigate("/history"); return null; }

    // Page setup
    const audioRef = useRef<HTMLAudioElement>(null);
    const [currentTime,       setCurrentTime      ] = useState(0);
    const [selectedBiomarker, setSelectedBiomarker] = useState("");
    const [showScoreRail,     setShowScoreRail    ] = useState<boolean>(() => {
        try { return localStorage.getItem(SCORE_RAIL_KEY) === "true"; } catch { return false; }
    });
    useEffect(() => {
        try { localStorage.setItem(SCORE_RAIL_KEY, String(showScoreRail)); } catch { /* ignore */ }
    }, [showScoreRail]);

    // Modal state for biomarker explainer
    const [modalBiomarker, setModalBiomarker] = useState<string | null>(null);
    const openInfo = (type: string) => setModalBiomarker(type);

    // Derive the media URL from the API base (strip trailing /api)
    const sessionStartMs = new Date(session.start_ts).getTime();
    const MEDIA_BASE = API_URL.replace(/\/api\/?$/, "");
    const audioUrl   = session.audio_file ? `${MEDIA_BASE}/media/${session.audio_file}` : undefined;

    // Patient name comes from the session's profile
    const patientName = `${session.profile.account.user.first_name} ${session.profile.account.user.last_name}`;
    const selectedBiomarkerInfo = selectedBiomarker ? getBiomarkerInfo(selectedBiomarker) : null;

    // Audio seeking
    const onSeek = (sec: number) => {
        if (audioRef.current) audioRef.current.currentTime = sec;
        console.log(`Set audio player to: ${sec}`);
    };

    // UI Component
    return (
        <BiomarkerInfoContext.Provider value={openInfo}>
            <AdminPage contained={false}>
                
                {/* ================================================================================ */}
                {/* Header (sticky) */}
                {/* ================================================================================ */}
                <header className="sticky top-0 z-10 bg-admin-panel/95 backdrop-blur border-b border-admin-border">

                    {/* -------------------------------------------------------------------------------- */}
                    {/* Row 1 => Back Button | Page Title | Selected Biomarker Badge | Audio Player */}
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
               
                            <span className="text-base text-admin-subtext">
                                {dateFormatLong.format(new Date(session.date))} — {patientName}
                            </span>
                        </div>

                        {/* Audio Player */}
                        <div className="ml-auto">
                            <AudioPlayer
                                audioRef    ={audioRef}
                                src         ={audioUrl}
                                onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
                            />
                        </div>
                    </div>

                    {/* -------------------------------------------------------------------------------- */}
                    {/* Row 2 => Biomarker Selector | Biomarker Stats | Score Rail Toggle */}
                    {/* -------------------------------------------------------------------------------- */}
                    <div className="flex items-center gap-4 px-4 md:px-6 py-3 border-t border-admin-border flex-wrap">

                        {/* Biomarker Selector */}
                        <BiomarkerSelector
                            biomarkers       ={session.biomarkers}
                            selectedBiomarker={selectedBiomarker}
                            onChange         ={setSelectedBiomarker}
                            onInfoClick      ={openInfo}
                        />
                        <div className="ml-auto flex items-center gap-3 flex-wrap">

                            {/* Selected Biomarker */}
                            {selectedBiomarkerInfo && (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-admin-accentSoft border border-admin-accent/30 px-3 py-1 text-base font-medium text-admin-accent2">
                                    <span className="text-admin-accent">·</span>
                                    {selectedBiomarkerInfo.name}
                                </span>
                            )}

                            {/* Biomarker Stats */}
                            <BiomarkerStatsBar
                                biomarkers       ={session.biomarkers}
                                selectedBiomarker={selectedBiomarker}
                            />

                            {/* Score Rail Toggle */}
                            <AdminButton
                                variant ={showScoreRail ? "primary" : "outline"}
                                size    = "sm"
                                iconLeft={<LuColumns2 size={14} />}
                                onClick = {() => setShowScoreRail(v => !v)}
                            >
                                Score rail
                            </AdminButton>
                        </div>
                    </div>
                </header>
                
                {/* ================================================================================ */}
                {/* Body */}
                {/* ================================================================================ */}
                {/* Main Transcript Content */}
                <PlaybackTranscript
                    messages         ={session.messages}
                    biomarkers       ={session.biomarkers}
                    sessionStartMs   ={sessionStartMs}
                    currentTime      ={currentTime}
                    selectedBiomarker={selectedBiomarker}
                    userName         ={patientName}
                    onSeek           ={onSeek}
                    showScoreRail    ={showScoreRail && !!selectedBiomarker}
                />

                {/* Hidden Modal */}
                <BiomarkerInfoModal
                    isOpen       ={modalBiomarker !== null}
                    biomarkerType={modalBiomarker}
                    onClose      ={() => setModalBiomarker(null)}
                />

            </AdminPage>
        </BiomarkerInfoContext.Provider>
    );
}
