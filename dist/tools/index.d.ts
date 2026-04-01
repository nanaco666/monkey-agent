export declare const toolDefs: ({
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
} | {
    name: string;
    description: string;
    input_schema: {
        type: "object";
        properties: {
            path: {
                type: string;
                description: string;
            };
            start_line: {
                type: string;
                description: string;
            };
            end_line: {
                type: string;
                description: string;
            };
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    input_schema: {
        type: "object";
        properties: {
            path: {
                type: string;
                description: string;
            };
            content: {
                type: string;
                description: string;
            };
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    input_schema: {
        type: "object";
        properties: {
            path: {
                type: string;
                description: string;
            };
            old_string: {
                type: string;
                description: string;
            };
            new_string: {
                type: string;
                description: string;
            };
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    input_schema: {
        type: "object";
        properties: {
            pattern: {
                type: string;
                description: string;
            };
            cwd: {
                type: string;
                description: string;
            };
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    input_schema: {
        type: "object";
        properties: {
            pattern: {
                type: string;
                description: string;
            };
            path: {
                type: string;
                description: string;
            };
            glob: {
                type: string;
                description: string;
            };
            case_insensitive: {
                type: string;
                description: string;
            };
        };
        required: string[];
    };
})[];
export declare function executeTool(name: string, input: Record<string, unknown>): Promise<string>;
