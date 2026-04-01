export declare const globToolDef: {
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
};
export declare function runGlob(pattern: string, cwd?: string): string;
