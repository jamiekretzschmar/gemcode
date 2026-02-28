export interface FileNode {
  name: string;
  path: string;
  content?: string;
  type: 'file' | 'dir';
  children?: FileNode[];
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}
