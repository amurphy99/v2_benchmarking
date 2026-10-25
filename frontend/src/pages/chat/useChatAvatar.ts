/* Keep the chat page's avatar in step with the chat.
--------------------------------------------------------------------------------
`@frontend/src/pages/chat/useChatAvatar`

Drives the avatar's optional handle methods, so avatars without them (the QT
and Buddy models) simply ignore it:

  - sleep: asleep whenever the chat isn't running and no reply is playing (on
    page load, and after a pause from either side), awake as soon as it starts
    or resumes. A paused chat still finishes the sentence it is saying first.
  - conversation look: listening while the microphone is on, thinking from the
    participant's finished utterance until the reply starts, speaking while the
    reply plays, and idle while the chat is stopped.
  - mouth: follows the reply's audio through `useSpeakingAvatar`. Its speech
    gaze stays off on this page until it has been tested on the demo page.

The effects also re-run when the avatar changes, so a newly mounted avatar
picks up the current sleep state and look right away.

*/
import type { RefObject } from "react";
import      { useEffect } from "react";

// From this project
import type { AvatarHandle, ConversationState } from "@/pages/common/avatar/avatarRegistry";
import type { SpeechReaders                   } from "@/pages/common/avatar/useSpeakingAvatar";
import      { useSpeakingAvatar               } from "@/pages/common/avatar/useSpeakingAvatar";

// What the chat is doing right now
type ChatActivity = {
    running        : boolean;   // Started and not paused (the microphone is on)
    systemSpeaking : boolean;   // Reply speech is playing
    awaitingReply  : boolean;   // The participant finished talking and the reply has not started
};


// ================================================================================
// Chat Avatar
// ================================================================================
// Doze the avatar off while the chat is stopped, and drive its look and mouth while it runs
export function useChatAvatar(
    avatarRef   : RefObject<AvatarHandle | null>,   // Avatar on the chat page (null until it mounts)
    avatarModel : string | null,                    // Avatar showing (null while the settings load)
    chat        : ChatActivity,                     // What the chat is doing right now
    speech      : SpeechReaders,                    // The audio player's readers for the reply
): void {
    // Sleep: awake while the chat runs or a reply is still playing
    const awake = chat.running || chat.systemSpeaking;
    useEffect(() => {
        if (awake) { avatarRef.current?.wake ?.(); }
        else       { avatarRef.current?.sleep?.(); }
    }, [avatarRef, avatarModel, awake]);

    // Conversation look
    const look: ConversationState =
        !chat.running       ? "idle"     :
        chat.systemSpeaking ? "speaking" :
        chat.awaitingReply  ? "thinking" :
                              "listening";
    useEffect(() => {
        avatarRef.current?.setConversationState?.(look);
    }, [avatarRef, avatarModel, look]);

    // Mouth (speech gaze stays off here until it has been tested)
    useSpeakingAvatar(avatarRef, speech, chat.systemSpeaking, false);
}
