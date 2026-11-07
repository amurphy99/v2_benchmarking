import type { RobotViewer } from "./gltf-robot";

/** Catalogs exposed for manual previews. */
export const RECORDED_EMOTIONS: readonly string[];
export const DANCES: Readonly<Record<string, unknown>>;

/** Only the upstream methods used by this demo are declared here. */
export class RobotMotion {
    constructor(viewer: RobotViewer);

    setState(state: string): void;
    attachAssistantAudio(analyser: AnalyserNode | null): void;

    playEmotion(name: string): Promise<unknown>;
    playDance(name: string, repeat?: number): unknown;
    stopEmotion(): boolean;
    stopDance(): boolean;

    start(): void;
    dispose(): void;
}