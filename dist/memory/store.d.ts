export declare function getMemoryDir(): string;
export declare function getSessionDir(): string;
export interface MemoryFile {
    filename: string;
    name: string;
    description: string;
    type: 'user' | 'feedback' | 'project' | 'reference';
    body: string;
}
export declare function readMemoryIndex(): string;
export declare function listTopicFiles(): MemoryFile[];
export declare function writeMemoryFile(filename: string, content: string): void;
export declare function appendSession(entry: object): void;
