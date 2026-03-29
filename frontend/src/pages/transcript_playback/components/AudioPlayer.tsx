import { RefObject  } from "react";
import { blockStyle } from "@/utils/styling/sharedStyles";

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
            <div className={`${blockStyle} flex items-center justify-center text-gray-400`}>
                No audio file available for this session.
            </div>
        );
    }

    return (
        <div className={blockStyle}>
            <audio
                ref          = {audioRef}
                src          = {src}
                controls
                onTimeUpdate = {onTimeUpdate}
                className    = "w-full"
            />
        </div>
    );
}
