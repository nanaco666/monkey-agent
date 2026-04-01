import Anthropic from '@anthropic-ai/sdk';
import type { Config } from '../config/index.js';
export type Message = Anthropic.MessageParam;
export declare function streamResponse(client: Anthropic, config: Config, messages: Message[], onText: (text: string) => void, onToolUse: (name: string, input: Record<string, unknown>) => void, memoryContext?: string): Promise<{
    toolUses: Array<{
        id: string;
        name: string;
        input: Record<string, unknown>;
    }>;
}>;
export declare function makeClient(config: Config): Anthropic;
