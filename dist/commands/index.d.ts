export interface SlashCommand {
    name: string;
    description: string;
    argsPlaceholder?: string;
    allowedTools: string[];
    buildPrompt: (args: string) => string;
}
export declare const commands: SlashCommand[];
export interface PickerEntry {
    cmd: string;
    description: string;
    argsPlaceholder?: string;
}
export declare const ALL_PICKER_ENTRIES: PickerEntry[];
export declare function findCommand(name: string): SlashCommand | undefined;
