export declare const readToolDef: {
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
};
export declare function runRead(path: string, startLine?: number, endLine?: number): string;
