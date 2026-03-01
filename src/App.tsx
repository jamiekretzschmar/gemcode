/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Github, 
  Upload, 
  Send, 
  FileCode, 
  Folder, 
  ChevronRight, 
  ChevronDown, 
  Terminal,
  Download,
  Trash2,
  Loader2,
  Code2,
  Search,
  GitBranch,
  GitCommit,
  GitMerge,
  FileDiff,
  X,
  LayoutTemplate,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import ReactDiffViewer from 'react-diff-viewer-continued';
import { saveAs } from 'file-saver';
import { cn } from './lib/utils';
import { FileNode, ChatMessage } from './types';
import { GeminiService } from './services/geminiService';

const gemini = new GeminiService();

const MAX_FILE_SIZE = 500 * 1024; // 500KB
const MAX_REPO_FILES = 100;
const BINARY_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'ico', 'pdf', 'zip', 'tar', 'gz', 'mp4', 'mp3', 'woff', 'woff2', 'ttf', 'eot'];

export default function App() {
  const [gitUrl, setGitUrl] = useState('');
  const [files, setFiles] = useState<FileNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDiff, setShowDiff] = useState(false);
  const [diffOriginal, setDiffOriginal] = useState('');
  const [diffModified, setDiffModified] = useState('');
  const [activeSidebarTab, setActiveSidebarTab] = useState<'files' | 'tools'>('files');
  const [activeMainTab, setActiveMainTab] = useState<'editor' | 'terminal' | 'preview'>('terminal');
  const [toast, setToast] = useState<{msg: string, type: 'error' | 'success'} | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (msg: string, type: 'error' | 'success' = 'success') => setToast({ msg, type });

  const filteredFiles = useMemo(() => {
    if (!searchTerm) return files;
    const filterNodes = (nodes: FileNode[]): FileNode[] => {
      return nodes.reduce((acc, node) => {
        if (node.type === 'file' && node.name.toLowerCase().includes(searchTerm.toLowerCase())) {
          acc.push(node);
        } else if (node.type === 'dir') {
          const filteredChildren = node.children ? filterNodes(node.children) : [];
          if (filteredChildren.length > 0) {
            acc.push({ ...node, children: filteredChildren });
          }
        }
        return acc;
      }, [] as FileNode[]);
    };
    return filterNodes(files);
  }, [files, searchTerm]);

  const handleImportGit = async () => {
    if (!gitUrl.trim()) {
      showToast('Please enter a valid GitHub URL', 'error');
      return;
    }
    setIsImporting(true);
    try {
      const match = gitUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
      if (!match) throw new Error('Invalid URL format. Use: https://github.com/owner/repo');
      
      const [_, owner, repo] = match;
      let fileCount = 0;
      
      const fetchRepo = async (path: string = ''): Promise<FileNode[]> => {
        if (fileCount >= MAX_REPO_FILES) return [];
        
        const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`);
        if (!res.ok) {
          if (res.status === 403) throw new Error('GitHub API rate limit exceeded.');
          if (res.status === 404) throw new Error('Repository or path not found.');
          throw new Error(`GitHub API error: ${res.statusText}`);
        }
        
        const data = await res.json();
        if (!Array.isArray(data)) return [];

        const nodes: FileNode[] = [];
        for (const item of data) {
          if (fileCount >= MAX_REPO_FILES) break;
          
          if (['node_modules', '.git', 'dist', 'build', 'coverage'].includes(item.name)) continue;

          if (item.type === 'dir') {
            const children = await fetchRepo(item.path);
            if (children.length > 0) {
              nodes.push({ name: item.name, path: item.path, type: 'dir', children });
            }
          } else {
            const ext = item.name.split('.').pop()?.toLowerCase() || '';
            if (BINARY_EXTS.includes(ext)) continue;
            if (item.size > MAX_FILE_SIZE) continue;

            const contentRes = await fetch(item.download_url);
            if (!contentRes.ok) continue;
            const content = await contentRes.text();
            nodes.push({ name: item.name, path: item.path, type: 'file', content });
            fileCount++;
          }
        }
        return nodes;
      };

      const repoFiles = await fetchRepo();
      if (repoFiles.length === 0) throw new Error('No readable text files found or repository is empty.');
      
      setFiles(repoFiles);
      setMessages(prev => [...prev, { role: 'model', text: `Successfully imported **${repo}** (${fileCount} files loaded). \n\n*Note: Large files and binaries were skipped to optimize context.*` }]);
      showToast(`Imported ${fileCount} files successfully`);
      setActiveSidebarTab('files');
    } catch (err: any) {
      showToast(err.message, 'error');
      setMessages(prev => [...prev, { role: 'model', text: `**Error importing repository:** ${err.message}` }]);
    } finally {
      setIsImporting(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = e.target.files;
    if (!uploadedFiles) return;

    let skipped = 0;
    let added = 0;

    Array.from(uploadedFiles).forEach(file => {
      if (file.size > MAX_FILE_SIZE) {
        skipped++;
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        setFiles(prev => {
          const path = file.webkitRelativePath || file.name;
          if (prev.some(f => f.path === path)) return prev;
          added++;
          return [...prev, { name: file.name, path, type: 'file', content }];
        });
      };
      reader.readAsText(file);
    });

    setTimeout(() => {
      if (skipped > 0) showToast(`Skipped ${skipped} files larger than 500KB`, 'error');
      else if (added > 0) showToast(`Added local files successfully`);
    }, 100);
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: ChatMessage = { role: 'user', text: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    setActiveMainTab('terminal');

    try {
      const response = await gemini.chat([...messages, userMsg], files);
      if (response) {
        setMessages(prev => [...prev, { role: 'model', text: response }]);
      }
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'model', text: `Error: ${err.message}` }]);
      showToast('Failed to generate response', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefactor = async () => {
    if (!selectedFile || isLoading) return;
    setIsLoading(true);
    setActiveMainTab('terminal');
    setMessages(prev => [...prev, { role: 'user', text: `Refactor ${selectedFile.name}` }]);
    try {
      const response = await gemini.refactor(selectedFile, files);
      if (response) {
        setMessages(prev => [...prev, { role: 'model', text: response }]);
        // Attempt to extract code block for diff
        const codeBlockMatch = response.match(/```(?:typescript|javascript|tsx|jsx|css|html)?\n([\s\S]*?)```/);
        if (codeBlockMatch && codeBlockMatch[1]) {
          setDiffOriginal(selectedFile.content || '');
          setDiffModified(codeBlockMatch[1]);
          setShowDiff(true);
          setActiveMainTab('editor');
          showToast('Refactoring complete. View diff in Editor.');
        }
      }
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'model', text: `Error: ${err.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExplain = async () => {
    if (isLoading) return;
    setIsLoading(true);
    setMessages(prev => [...prev, { role: 'user', text: selectedFile ? `Explain ${selectedFile.name}` : "Explain the repository" }]);
    try {
      const response = await gemini.explain(selectedFile, files);
      if (response) setMessages(prev => [...prev, { role: 'model', text: response }]);
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'model', text: `Error: ${err.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGitGuide = async (task: string) => {
    if (isLoading) return;
    setIsLoading(true);
    setMessages(prev => [...prev, { role: 'user', text: `Git Guide: ${task}` }]);
    try {
      const response = await gemini.gitGuide(task);
      if (response) setMessages(prev => [...prev, { role: 'model', text: response }]);
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'model', text: `Error: ${err.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportChat = () => {
    if (messages.length === 0) {
      showToast('No chat history to export', 'error');
      return;
    }
    const chatContent = messages.map(m => `[${m.role.toUpperCase()}]\n${m.text}\n`).join('\n---\n\n');
    const blob = new Blob([chatContent], { type: 'text/plain;charset=utf-8' });
    saveAs(blob, 'gemcode-chat-export.txt');
    showToast('Chat exported successfully');
  };

  const getPreviewUrl = () => {
    const htmlFile = files.find(f => f.name.toLowerCase() === 'index.html');
    if (!htmlFile || !htmlFile.content) return null;
    const blob = new Blob([htmlFile.content], { type: 'text/html' });
    return URL.createObjectURL(blob);
  };

  const FileTree = ({ nodes, depth = 0 }: { nodes: FileNode[], depth?: number }) => {
    return (
      <div className="flex flex-col">
        {nodes.map((node, i) => (
          <div key={node.path + i}>
            <div 
              className={cn(
                "data-row flex items-center py-1.5 px-4 cursor-pointer text-xs font-mono",
                selectedFile?.path === node.path && "bg-[#141414] text-[#E4E3E0]"
              )}
              style={{ paddingLeft: `${(depth + 1) * 16}px` }}
              onClick={() => node.type === 'file' ? setSelectedFile(node) : null}
            >
              {node.type === 'dir' ? (
                <Folder className="w-3 h-3 mr-2 opacity-60" />
              ) : (
                <FileCode className="w-3 h-3 mr-2 opacity-60" />
              )}
              <span className="truncate">{node.name}</span>
            </div>
            {node.children && <FileTree nodes={node.children} depth={depth + 1} />}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#E4E3E0]">
      {/* Toast Notification */}
      {toast && (
        <div className="absolute top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 bg-[#141414] text-[#E4E3E0] rounded shadow-lg text-sm font-mono animate-in fade-in slide-in-from-top-4">
          {toast.type === 'error' ? <AlertCircle className="w-4 h-4 text-red-400" /> : <CheckCircle2 className="w-4 h-4 text-green-400" />}
          {toast.msg}
        </div>
      )}

      {/* Sidebar */}
      <aside className="w-72 shrink-0 border-r border-[#141414] flex flex-col bg-[#E4E3E0]">
        <div className="p-4 border-b border-[#141414] flex items-center gap-2 shrink-0">
          <Code2 className="w-5 h-5" />
          <h1 className="font-serif italic text-lg font-bold tracking-tight">GemCode</h1>
        </div>
        
        <div className="flex border-b border-[#141414] shrink-0">
          <button 
            className={cn("flex-1 py-2 text-xs font-mono border-r border-[#141414] transition-colors", activeSidebarTab === 'files' ? "bg-[#141414] text-[#E4E3E0]" : "hover:bg-[#DCDAD7]")} 
            onClick={() => setActiveSidebarTab('files')}
          >
            Files
          </button>
          <button 
            className={cn("flex-1 py-2 text-xs font-mono transition-colors", activeSidebarTab === 'tools' ? "bg-[#141414] text-[#E4E3E0]" : "hover:bg-[#DCDAD7]")} 
            onClick={() => setActiveSidebarTab('tools')}
          >
            Tools
          </button>
        </div>

        {activeSidebarTab === 'files' ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-[#141414] space-y-3 shrink-0">
              <div className="relative">
                <Github className="absolute left-2 top-2.5 w-4 h-4 opacity-40" />
                <input 
                  type="text"
                  placeholder="GitHub Repo URL"
                  className="w-full pl-8 pr-4 py-2 bg-transparent border border-[#141414] text-xs font-mono focus:outline-none focus:ring-1 focus:ring-[#141414]"
                  value={gitUrl}
                  onChange={(e) => setGitUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleImportGit()}
                />
                <button 
                  onClick={handleImportGit}
                  disabled={isImporting}
                  className="absolute right-1 top-1 p-1.5 hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors disabled:opacity-50"
                >
                  {isImporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                </button>
              </div>

              <label className="flex items-center justify-center gap-2 w-full py-2 border border-[#141414] border-dashed text-xs font-mono cursor-pointer hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors">
                <Upload className="w-3 h-3" />
                Local Files
                <input type="file" multiple className="hidden" onChange={handleFileUpload} />
              </label>

              <div className="relative">
                <Search className="absolute left-2 top-2.5 w-4 h-4 opacity-40" />
                <input 
                  type="text"
                  placeholder="Search files..."
                  className="w-full pl-8 pr-4 py-2 bg-transparent border border-[#141414] text-xs font-mono focus:outline-none focus:ring-1 focus:ring-[#141414]"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="p-2 border-b border-[#141414] bg-[#DCDAD7] sticky top-0 z-10">
                <span className="col-header px-2">Explorer</span>
              </div>
              {files.length === 0 ? (
                <div className="p-8 text-center opacity-40 flex flex-col items-center gap-2">
                  <Terminal className="w-8 h-8" />
                  <p className="text-[10px] font-mono uppercase tracking-widest">No files</p>
                </div>
              ) : (
                <FileTree nodes={filteredFiles} />
              )}
            </div>

            <div className="p-3 border-t border-[#141414] bg-[#DCDAD7] flex items-center justify-between shrink-0">
              <span className="text-[10px] font-mono opacity-60">{files.length} items</span>
              <button onClick={() => setFiles([])} className="hover:text-red-500 transition-colors">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-1 gap-2">
              <button 
                onClick={handleExplain}
                disabled={isLoading}
                className="flex items-center justify-center gap-2 py-2 border border-[#141414] text-xs font-mono hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors disabled:opacity-50"
              >
                <Search className="w-4 h-4" />
                Explain Code
              </button>
              <button 
                onClick={handleRefactor}
                disabled={isLoading || !selectedFile}
                className="flex items-center justify-center gap-2 py-2 border border-[#141414] text-xs font-mono hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors disabled:opacity-50"
              >
                <Code2 className="w-4 h-4" />
                Refactor
              </button>
              <button 
                onClick={() => handleGitGuide("Manage branches: create, list, switch, delete")}
                disabled={isLoading}
                className="flex items-center justify-center gap-2 py-2 border border-[#141414] text-xs font-mono hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors disabled:opacity-50"
              >
                <GitBranch className="w-4 h-4" />
                Branching Guide
              </button>
              <button 
                onClick={() => handleGitGuide("Stage changes and commit with a descriptive message")}
                disabled={isLoading}
                className="flex items-center justify-center gap-2 py-2 border border-[#141414] text-xs font-mono hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors disabled:opacity-50"
              >
                <GitCommit className="w-4 h-4" />
                Commit Guide
              </button>
              <button 
                onClick={() => handleGitGuide("Resolve merge conflicts")}
                disabled={isLoading}
                className="flex items-center justify-center gap-2 py-2 border border-[#141414] text-xs font-mono hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors disabled:opacity-50"
              >
                <GitMerge className="w-4 h-4" />
                Resolve Conflicts
              </button>
            </div>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 relative bg-[#E4E3E0]">
        <div className="flex border-b border-[#141414] bg-[#DCDAD7] shrink-0">
          <button 
            className={cn("px-6 py-2 text-xs font-mono border-r border-[#141414] transition-colors flex items-center gap-2", activeMainTab === 'terminal' ? "bg-[#141414] text-[#E4E3E0]" : "hover:bg-[#E4E3E0]")} 
            onClick={() => setActiveMainTab('terminal')}
          >
            <Terminal className="w-3 h-3" />
            Terminal
          </button>
          <button 
            className={cn("px-6 py-2 text-xs font-mono border-r border-[#141414] transition-colors flex items-center gap-2", activeMainTab === 'editor' ? "bg-[#141414] text-[#E4E3E0]" : "hover:bg-[#E4E3E0]")} 
            onClick={() => setActiveMainTab('editor')}
          >
            <FileCode className="w-3 h-3" />
            Editor
          </button>
          <button 
            className={cn("px-6 py-2 text-xs font-mono border-r border-[#141414] transition-colors flex items-center gap-2", activeMainTab === 'preview' ? "bg-[#141414] text-[#E4E3E0]" : "hover:bg-[#E4E3E0]")} 
            onClick={() => setActiveMainTab('preview')}
          >
            <LayoutTemplate className="w-3 h-3" />
            App Preview
          </button>
        </div>

        {activeMainTab === 'editor' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="h-10 border-b border-[#141414] flex items-center px-4 bg-[#DCDAD7] justify-between shrink-0">
              <div className="flex items-center gap-2 overflow-hidden">
                <span className="text-xs font-mono truncate">
                  {selectedFile?.path || 'Select a file to view'}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                {diffModified && (
                  <button 
                    onClick={() => setShowDiff(!showDiff)}
                    className={cn(
                      "flex items-center gap-1.5 px-2 py-1 text-[10px] font-mono border border-[#141414] transition-colors",
                      showDiff ? "bg-[#141414] text-[#E4E3E0]" : "hover:bg-[#141414] hover:text-[#E4E3E0]"
                    )}
                  >
                    <FileDiff className="w-3 h-3" />
                    {showDiff ? 'Hide Diff' : 'Show Diff'}
                  </button>
                )}
                {selectedFile && (
                  <button className="p-1 hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors rounded">
                    <Download className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-[#1e1e1e] relative">
              {showDiff && diffModified ? (
                <div className="absolute inset-0 bg-white overflow-auto">
                   <ReactDiffViewer 
                      oldValue={diffOriginal} 
                      newValue={diffModified} 
                      splitView={true}
                      useDarkTheme={true}
                      styles={{
                        variables: {
                          dark: {
                            diffViewerBackground: '#1e1e1e',
                            diffViewerColor: '#d4d4d4',
                            addedBackground: '#2ea04326',
                            addedColor: 'white',
                            removedBackground: '#f8514926',
                            removedColor: 'white',
                            wordAddedBackground: '#2ea0434d',
                            wordRemovedBackground: '#f851494d',
                          }
                        }
                      }}
                    />
                </div>
              ) : selectedFile ? (
                <SyntaxHighlighter 
                  language={selectedFile.name.split('.').pop() || 'javascript'} 
                  style={vscDarkPlus}
                  customStyle={{ margin: 0, padding: '20px', fontSize: '13px', fontFamily: 'var(--font-mono)' }}
                >
                  {selectedFile.content || ''}
                </SyntaxHighlighter>
              ) : (
                <div className="h-full flex items-center justify-center opacity-20 flex-col gap-4">
                  <Code2 className="w-16 h-16" />
                  <p className="font-serif italic text-xl">Import code to begin analysis</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeMainTab === 'terminal' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="h-10 border-b border-[#141414] flex items-center justify-between px-4 bg-[#DCDAD7] shrink-0">
              <span className="col-header">GemCode Terminal</span>
              <button 
                onClick={handleExportChat}
                className="flex items-center gap-1.5 text-[10px] font-mono opacity-60 hover:opacity-100 transition-opacity"
              >
                <Download className="w-3 h-3" />
                Export Chat
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 && (
                <div className="text-center py-8 opacity-40 font-mono text-xs">
                  Ask GemCode about the imported codebase...
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={i} className={cn(
                  "flex flex-col max-w-[85%]",
                  msg.role === 'user' ? "ml-auto items-end" : "items-start"
                )}>
                  <div className={cn(
                    "px-4 py-2 rounded-lg text-sm",
                    msg.role === 'user' 
                      ? "bg-[#141414] text-[#E4E3E0]" 
                      : "bg-[#DCDAD7] border border-[#141414] text-[#141414]"
                  )}>
                    <div className="markdown-body">
                      <Markdown>{msg.text}</Markdown>
                    </div>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex items-center gap-2 text-xs font-mono opacity-60">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  GemCode is thinking...
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="p-4 border-t border-[#141414] shrink-0">
              <div className="relative flex items-center">
                <input 
                  type="text"
                  placeholder="Type a command or question..."
                  className="w-full pl-4 pr-12 py-3 bg-transparent border border-[#141414] text-sm font-mono focus:outline-none"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                />
                <button 
                  onClick={handleSendMessage}
                  disabled={isLoading || !input.trim()}
                  className="absolute right-2 p-2 hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors disabled:opacity-20"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {activeMainTab === 'preview' && (
          <div className="flex-1 flex flex-col overflow-hidden bg-white">
            <div className="h-10 border-b border-[#141414] flex items-center px-4 bg-[#DCDAD7] shrink-0">
              <span className="col-header">App Preview (index.html)</span>
            </div>
            <div className="flex-1 relative">
              {getPreviewUrl() ? (
                <iframe 
                  src={getPreviewUrl()!} 
                  className="w-full h-full border-none"
                  title="App Preview"
                  sandbox="allow-scripts allow-same-origin"
                />
              ) : (
                <div className="h-full flex items-center justify-center opacity-40 flex-col gap-4 bg-[#E4E3E0]">
                  <LayoutTemplate className="w-16 h-16" />
                  <p className="font-serif italic text-xl">No index.html found in workspace to preview.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
