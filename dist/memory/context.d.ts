import Anthropic from '@anthropic-ai/sdk';
import type { Config } from '../config/index.js';
export declare function buildMemoryContext(client: Anthropic, config: Config, recentMessages: string): Promise<string>;
