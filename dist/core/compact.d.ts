import Anthropic from '@anthropic-ai/sdk';
import type { Config } from '../config/index.js';
import type { Message } from './api.js';
export declare function shouldCompact(inputTokens: number): boolean;
export declare function compactMessages(client: Anthropic, config: Config, messages: Message[]): Promise<Message[]>;
