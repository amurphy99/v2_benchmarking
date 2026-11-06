/** Public surface used by our wrapper, including the local cleanup adapter. */
export class RobotViewer {
    constructor(container: HTMLElement);

    load(): Promise<void>;
    texturesReady(): Promise<void>;
    start(): void;
    dispose(): void;
}