export declare const editToolDef: {
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
};
export declare function runEdit(path: string, oldString: string, newString: string): string;
