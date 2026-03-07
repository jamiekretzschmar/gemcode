export interface FileNode {
  name: string;
  path: string;
  content?: string;
  type: 'file' | 'dir';
  children?: FileNode[];
  gitStatus?: 'modified' | 'untracked' | 'unmodified';
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}
