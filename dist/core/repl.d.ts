import Anthropic from '@anthropic-ai/sdk';
import type { Config } from '../config/index.js';
export declare function startRepl(client: Anthropic, config: Config): Promise<void>;
