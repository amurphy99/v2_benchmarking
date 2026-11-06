import type { RobotViewer } from "./gltf-robot";

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