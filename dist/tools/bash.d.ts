export declare const bashToolDef: {
    name: string;
    description: string;
    input_schema: {
        type: "object";
        properties: {
            command: {
                type: string;
                description: string;
            };
            timeout_ms: {
                type: string;
                description: string;
            };
        };
        required: string[];
    };
};
export declare function runBash(command: string, timeout?: number): Promise<string>;
