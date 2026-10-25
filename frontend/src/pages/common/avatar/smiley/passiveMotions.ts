/* Passive movements the smiley makes on its own, and the scheduler that plays them.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/smiley/passiveMotions`

A passive motion is a small movement nobody asked for, like a slight sway while
listening. Each one lists the conversation states it plays in, how likely it is
to be picked, and how long it runs. It is written leaning one way, and each play
mirrors it to a random side.

Passive movements play on channels, and different channels always overlap.
There are two kinds:

  - episodic ("head"): motions that must never overlap share one. It plays one
    motion at a time, then rests for a random gap before picking the next one,
    weighted at random among the motions allowed in the current state. A
    channel marked `heldByMotions` pauses for a movement or an animation (a nod,
    a yawn): nothing new starts while one plays or for a moment after, and a
    passive motion already playing fades out. A passive motion also fades out
    when the conversation state changes to one it does not play in.
    Expressions never block them, so the face can still sway while it smiles.
  - continuous ("breath"): one player that always runs and never rests, like
    breathing (`breathing.ts`). The controller hands it in, since animations
    and the page also steer it (a yawn's deep breath, a breath before speaking).

Glances, blinks, and the `wander` drift are still their own layers in the
controller (`useFaceController`); any of them could move onto a channel here.

*/
import type { ConversationState } from "../avatarRegistry";
import type { MotionOffsets     } from "./faceMotions";
import      { addOffsets, keyframes, mirrorOffsets, randomBetween, scaleOffsets } from "./faceMotions";

// Rest between two passive motions on one channel (picked at random each time)
const SMILEY_PASSIVE_GAP_MIN_MS = 2_000;
const SMILEY_PASSIVE_GAP_MAX_MS = 5_000;

// How quickly a passive motion fades out once it is blocked or out of its state (share per second)
const SMILEY_PASSIVE_FADE_PER_SEC = 6;

// Size and length of each passive motion (`degrees` is the lean; `shift` slides the whole face, in face radii)
const SMILEY_LISTEN_SWAY = {durationMs: [2_400, 3_200], degrees:  3, shift: 0.04};   // Lean and slide a little, then ease back
const SMILEY_HEAD_COCK   = {durationMs: [1_800, 2_600], degrees: 11, shift: 0.02};   // Tip quickly to the side, hold a moment, come back


// --------------------------------------------------------------------------------
// Passive Motion Types
// --------------------------------------------------------------------------------
// Channels whose motions take turns (never overlapping), and channels that always play
type EpisodicChannel   = "head";
type ContinuousChannel = "breath";

// A continuous channel's player: this frame's offsets
export type ContinuousPlayer = (nowMs: number, dtSec: number) => MotionOffsets;

// One passive motion, written leaning to the right
type PassiveMotion = {
    channel    : EpisodicChannel;                // Channel it plays on
    states     : ConversationState[];            // Conversation states it may play in
    weight     : number;                         // Relative chance of being picked among the motions that may play
    durationMs : number[];                       // Shortest and longest length of one play
    sample     : (u: number) => MotionOffsets;   // Offsets at `u`, from 0 (start) to 1 (end), both at rest
};

// A passive motion being played, and how much of it still shows
type PlayingPassive = {motion: PassiveMotion; startMs: number; durationMs: number; side: number; fade: number};

// One channel's play and when it may pick the next one
type ChannelState = {playing: PlayingPassive | null; nextAt: number};

// Episodic channels, and whether a movement or animation holds each one
const SMILEY_EPISODIC_CHANNELS: Record<EpisodicChannel, {heldByMotions: boolean}> = {
    head : {heldByMotions: true},
};

// Every episodic passive motion
const SMILEY_PASSIVE_MOTIONS: PassiveMotion[] = [
    {channel: "head", states: ["listening"], weight: 3, durationMs: SMILEY_LISTEN_SWAY.durationMs, sample: listeningSway},
    {channel: "head", states: ["listening"], weight: 1, durationMs: SMILEY_HEAD_COCK  .durationMs, sample: headCock     },
];


// ================================================================================
// Passive Scheduler
// ================================================================================
// Return a function the frame loop calls once per frame for the passive offsets to add to the face
export function createPassiveScheduler(startMs: number, continuous: Record<ContinuousChannel, ContinuousPlayer>): (nowMs: number, dtSec: number, conversation: ConversationState, motionPlaying: boolean) => MotionOffsets {
    // Each episodic channel starts with a rest
    const channels: Record<EpisodicChannel, ChannelState> = {head: {playing: null, nextAt: startMs + restMs()}};

    return (nowMs: number, dtSec: number, conversation: ConversationState, motionPlaying: boolean): MotionOffsets => {
        // Continuous channels always play
        let total: MotionOffsets = {};
        for (const play of Object.values(continuous)) total = addOffsets(total, play(nowMs, dtSec));

        // Episodic channels take turns among their motions
        for (const [channel, state] of Object.entries(channels) as [EpisodicChannel, ChannelState][]) {
            // 1) A movement or animation holds the channel, and the rest after it starts once it ends
            const held = motionPlaying && SMILEY_EPISODIC_CHANNELS[channel].heldByMotions;
            if (held) state.nextAt = Math.max(state.nextAt, nowMs + SMILEY_PASSIVE_GAP_MIN_MS);

            // 2) After the rest, pick one of the motions allowed now (none allowed rests again)
            if ((state.playing === null) && (nowMs >= state.nextAt)) {
                const motion = pickWeighted(SMILEY_PASSIVE_MOTIONS.filter((m: PassiveMotion) => (m.channel === channel) && m.states.includes(conversation)));
                if (motion === null) state.nextAt = nowMs + restMs();
                else                 state.playing = {motion, startMs: nowMs, durationMs: randomBetween(motion.durationMs[0], motion.durationMs[1]), side: (Math.random() < 0.5) ? -1 : 1, fade: 1};
            }
            const playing = state.playing;
            if (playing === null) continue;

            // 3) Fade out once held or out of its state, and finish at its end
            if (held || !playing.motion.states.includes(conversation)) playing.fade = Math.max(0, playing.fade - (SMILEY_PASSIVE_FADE_PER_SEC * dtSec));
            const u = (nowMs - playing.startMs) / playing.durationMs;
            if ((u >= 1) || (playing.fade === 0)) {
                state.playing = null;
                state.nextAt  = nowMs + restMs();
                continue;
            }

            // 4) This frame's offsets, on the side picked for this play
            const offsets = playing.motion.sample(u);
            total = addOffsets(total, scaleOffsets((playing.side > 0) ? offsets : mirrorOffsets(offsets), playing.fade));
        }
        return total;
    };
}


// --------------------------------------------------------------------------------
// Scheduler Helpers
// --------------------------------------------------------------------------------
// A random rest between two passive motions
function restMs(): number {
    return randomBetween(SMILEY_PASSIVE_GAP_MIN_MS, SMILEY_PASSIVE_GAP_MAX_MS);
}

// One motion picked at random by weight (null when there are none)
function pickWeighted(motions: PassiveMotion[]): PassiveMotion | null {
    let roll = Math.random() * motions.reduce((sum: number, m: PassiveMotion) => sum + m.weight, 0);
    for (const motion of motions) {
        roll -= motion.weight;
        if (roll < 0) return motion;
    }
    return null;
}


// --------------------------------------------------------------------------------
// Passive Motion Shapes
// --------------------------------------------------------------------------------
// Lean and slide right, easing out and back with no hold
function listeningSway(u: number): MotionOffsets {
    const amount = Math.sin(Math.PI * u) ** 2;
    return {tilt: SMILEY_LISTEN_SWAY.degrees * amount, offsetX: SMILEY_LISTEN_SWAY.shift * amount};
}

// Tip right quickly, hold, then come back a little more slowly (like a dog cocking its head)
function headCock(u: number): MotionOffsets {
    const amount = keyframes(u, [[0, 0], [0.15, 1], [0.7, 1], [1, 0]]);
    return {tilt: SMILEY_HEAD_COCK.degrees * amount, offsetX: SMILEY_HEAD_COCK.shift * amount};
}
