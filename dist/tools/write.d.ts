export declare const writeToolDef: {
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
};
export declare function runWrite(path: string, content: string): string;
