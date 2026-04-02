export interface SlashCommand {
    name: string;
    description: string;
    allowedTools: string[];
    buildPrompt: (args: string) => string;
}
export declare const commands: SlashCommand[];
export declare function findCommand(name: string): SlashCommand | undefined;
