export declare class Spinner {
    private timer;
    private frame;
    private msg;
    start(msg: string): void;
    update(msg: string): void;
    stop(): void;
    private render;
}
export declare const spinner: Spinner;
