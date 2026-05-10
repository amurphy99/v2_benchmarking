/* Audio player for a recorded conversation.
--------------------------------------------------------------------------------
`frontend/src/pages/transcript_playback/components/AudioPlayer`

Playback is controlled either through buttons here or by clicking different
parts of the transcript. Clicking words will seek to wherever that word was
spoken in real-time during the conversation so you can listen to it. 

Currently, the audio serving is handled in a local/development-focused way. And,
apparently, this is really not a great way to do this for a deployed setting. So
as we add actual audio recording/saving for conversations we also need to figure
out how to do that properly...

*/
import { RefObject } from "react";

interface Props {
    audioRef     : RefObject<HTMLAudioElement>;
    src          : string | undefined;
    onTimeUpdate : () => void;
}

// --------------------------------------------------------------------------------
// Audio Player (we can control seeking/playback via the WordSpan elements)
// --------------------------------------------------------------------------------
export default function AudioPlayer({ audioRef, src, onTimeUpdate }: Props) {
    if (!src) {
        return (
            <div className="rounded-lg border border-admin-border bg-admin-muted px-3 py-2 text-sm text-admin-subtext text-center">
                No audio file available for this session.
            </div>
        );
    }

    return (
        <audio
            ref          = {audioRef}
            src          = {src}
            controls
            onTimeUpdate = {onTimeUpdate}
            className    = "w-full max-w-md"
        />
    );
}
