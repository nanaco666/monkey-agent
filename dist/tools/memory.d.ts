export declare const memoryWriteDef: {
    name: string;
    description: string;
    input_schema: {
        type: "object";
        properties: {
            filename: {
                type: string;
                description: string;
            };
            name: {
                type: string;
                description: string;
            };
            description: {
                type: string;
                description: string;
            };
            type: {
                type: string;
                enum: string[];
                description: string;
            };
            content: {
                type: string;
                description: string;
            };
        };
        required: string[];
    };
};
export declare function executeMemoryWrite(input: Record<string, unknown>): string;
