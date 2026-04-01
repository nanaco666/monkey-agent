export interface Config {
    api_key: string;
    base_url?: string;
    model: string;
    fast_model: string;
}
export declare function loadConfig(): Config | null;
export declare function getEnvDefaults(): {
    api_key: string;
    base_url: string;
};
export declare function saveConfig(partial: Partial<Config>): void;
