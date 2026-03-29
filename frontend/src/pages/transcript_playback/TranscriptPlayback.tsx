import { useRef, useState         } from "react";
import { useLocation, useNavigate } from "react-router-dom";

// From this project
import { ChatSession    } from "@/api";
import { API_URL        } from "@/utils/constants";
import { dateFormatLong } from "@/utils/styling/numFormatting";

// Components
import AudioPlayer        from "./components/AudioPlayer";
import BiomarkerSelector  from "./components/BiomarkerSelector";
import PlaybackTranscript from "./components/PlaybackTranscript";


// ================================================================================
// TranscriptPlayback
// ================================================================================
// Plays back a recorded session's audio while highlighting the currently-spoken
// word in the transcript. Word-level timestamps are stored as absolute datetimes
// and converted to audio offsets at render time via `sessionStartMs`.
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

    // Time anchor for converting absolute word timestamps -> audio offsets (seconds)
    const sessionStartMs = new Date(session.start_ts).getTime();

    // Derive the media URL from the API base (strip trailing /api)
    const MEDIA_BASE = API_URL.replace(/\/api\/?$/, "");
    const audioUrl   = session.audio_file ? `${MEDIA_BASE}/media/${session.audio_file}` : undefined;

    // Patient name comes from the session's profile
    const patientName = `${session.profile.account.user.first_name} ${session.profile.account.user.last_name}`;

    // Audio seeking
    const onSeek = (sec: number) => {
        if (audioRef.current) audioRef.current.currentTime = sec;
    };

    // Style Helpers
    const backStyle = "text-2xl font-bold hover:cursor-pointer";


    return (
        <div className="flex flex-col">
            {/* -------------------------------------------------------------------------------- */}
            {/* Header */}
            {/* -------------------------------------------------------------------------------- */}
            <div className="flex flex-row items-center mx-[1rem] mb-[1rem] mt-[1rem] gap-[1rem]">

                {/* Back Button for Navigation */}
                <span className={backStyle} onClick={() => navigate(-1)}> ← </span>

                {/* Session "Title" */}
                <b className="text-violet-600 text-4xl">
                    {dateFormatLong.format(new Date(session.date))}
                </b>
            </div>

            {/* -------------------------------------------------------------------------------- */}
            {/* Body */}
            {/* -------------------------------------------------------------------------------- */}
            <div className="flex flex-col mx-[1rem] mb-[1rem] gap-[1rem]">
                {/* Audio Player */}
                <AudioPlayer
                    audioRef    ={audioRef}
                    src         ={audioUrl}
                    onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
                />
                
                {/* Biomarker Selection */}
                <BiomarkerSelector
                    biomarkers       ={session.biomarkers  }
                    selectedBiomarker={   selectedBiomarker}
                    onChange         ={setSelectedBiomarker}
                />

                {/* Transcript with Highlights & Seeking */}
                <PlaybackTranscript
                    messages         ={session.messages}
                    biomarkers       ={session.biomarkers}
                    sessionStartMs   ={sessionStartMs}
                    currentTime      ={currentTime}
                    selectedBiomarker={selectedBiomarker}
                    userName         ={patientName}
                    onSeek           ={onSeek}
                />
            </div>

        </div>
    );
}
