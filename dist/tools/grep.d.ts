export declare const grepToolDef: {
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
};
export declare function runGrep(pattern: string, path?: string, glob?: string, caseInsensitive?: boolean): string;
