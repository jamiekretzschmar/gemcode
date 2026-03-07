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
  CheckCircle2,
  Activity,
  Plus,
  Save,
  Edit3,
  Check
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
import { Link } from 'react-router-dom';

const gemini = new GeminiService();

const MAX_FILE_SIZE = 500 * 1024; // 500KB
const MAX_REPO_FILES = 100;
const BINARY_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'ico', 'pdf', 'zip', 'tar', 'gz', 'mp4', 'mp3', 'woff', 'woff2', 'ttf', 'eot'];

export default function PowerShellApp() {
  const [gitUrl, setGitUrl] = useState('');
  const [files, setFiles] = useState<FileNode[]>(() => {
    try { const s = localStorage.getItem('gemcode_workspace'); return s ? JSON.parse(s).files || [] : []; } catch(e) { return []; }
  });
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try { const s = localStorage.getItem('gemcode_workspace'); return s ? JSON.parse(s).messages || [] : []; } catch(e) { return []; }
  });
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
  const [commandHistory, setCommandHistory] = useState<string[]>(() => {
    try { const s = localStorage.getItem('gemcode_workspace'); return s ? JSON.parse(s).commandHistory || [] : []; } catch(e) { return []; }
  });
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [useRegex, setUseRegex] = useState(false);
  const [snippets, setSnippets] = useState<{name: string, code: string}[]>(() => {
    try { 
      const s = localStorage.getItem('gemcode_workspace'); 
      const parsed = s ? JSON.parse(s) : null;
      return parsed && parsed.snippets ? parsed.snippets : [
        { name: 'React Component', code: 'export default function Component() {\n  return <div></div>;\n}' },
        { name: 'Console Log', code: 'console.log();' }
      ]; 
    } catch(e) { return []; }
  });
  const [newSnippetName, setNewSnippetName] = useState('');
  const [newSnippetCode, setNewSnippetCode] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [githubToken, setGithubToken] = useState<string | null>(() => {
    try { return localStorage.getItem('gemcode_github_token'); } catch(e) { return null; }
  });
  const [githubRepos, setGithubRepos] = useState<any[]>([]);
  const [showRepoSelect, setShowRepoSelect] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('gemcode_workspace', JSON.stringify({ 
      files, messages, snippets, commandHistory, 
      selectedFilePath: selectedFile?.path 
    }));
  }, [files, messages, snippets, commandHistory, selectedFile]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'GITHUB_AUTH_SUCCESS') {
        const token = event.data.token;
        setGithubToken(token);
        localStorage.setItem('gemcode_github_token', token);
        showToast('GitHub connected successfully!');
        fetchGithubRepos(token);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleConnectGithub = async () => {
    try {
      const response = await fetch('/api/auth/github/url');
      if (!response.ok) throw new Error('Failed to get auth URL');
      const { url } = await response.json();
      window.open(url, 'oauth_popup', 'width=600,height=700');
    } catch (error) {
      showToast('Failed to initiate GitHub login', 'error');
    }
  };

  const fetchGithubRepos = async (token: string) => {
    try {
      const res = await fetch('https://api.github.com/user/repos?sort=updated&per_page=20', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const repos = await res.json();
        setGithubRepos(repos);
        setShowRepoSelect(true);
      }
    } catch (error) {
      showToast('Failed to fetch repositories', 'error');
    }
  };

  const updateFileContent = (path: string, newContent: string) => {
    const updateNode = (nodes: FileNode[]): FileNode[] => {
      return nodes.map(node => {
        if (node.path === path) {
          return { ...node, content: newContent, gitStatus: node.gitStatus === 'untracked' ? 'untracked' : 'modified' };
        }
        if (node.children) {
          return { ...node, children: updateNode(node.children) };
        }
        return node;
      });
    };
    setFiles(prev => updateNode(prev));
    if (selectedFile && selectedFile.path === path) {
      setSelectedFile(prev => prev ? { ...prev, content: newContent, gitStatus: prev.gitStatus === 'untracked' ? 'untracked' : 'modified' } : null);
    }
  };

  const insertSnippet = (code: string) => {
    if (!selectedFile) {
      showToast('Select a file to insert snippet', 'error');
      return;
    }
    const newContent = (selectedFile.content || '') + '\n' + code;
    updateFileContent(selectedFile.path, newContent);
    showToast('Snippet inserted');
    setActiveMainTab('editor');
  };

  const handleSaveSnippet = () => {
    if (!newSnippetName || !newSnippetCode) return;
    setSnippets(prev => [...prev, { name: newSnippetName, code: newSnippetCode }]);
    setNewSnippetName('');
    setNewSnippetCode('');
    showToast('Snippet saved');
  };

  const applyRefactor = () => {
    if (selectedFile && diffModified) {
      updateFileContent(selectedFile.path, diffModified);
      setShowDiff(false);
      setDiffModified('');
      showToast('Refactor applied');
    }
  };

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
    
    let regex: RegExp | null = null;
    if (useRegex) {
      try { regex = new RegExp(searchTerm, 'i'); } catch (e) {}
    }
    const term = searchTerm.toLowerCase();

    const filterNodes = (nodes: FileNode[]): FileNode[] => {
      return nodes.reduce((acc, node) => {
        if (node.type === 'file') {
          const nameMatch = regex ? regex.test(node.name) : node.name.toLowerCase().includes(term);
          const contentMatch = node.content ? (regex ? regex.test(node.content) : node.content.toLowerCase().includes(term)) : false;
          if (nameMatch || contentMatch) {
            acc.push(node);
          }
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
  }, [files, searchTerm, useRegex]);

  const handleImportGit = async (urlToImport?: string) => {
    const targetUrl = urlToImport || gitUrl;
    if (!targetUrl.trim()) {
      showToast('Please enter a valid GitHub URL', 'error');
      return;
    }
    setIsImporting(true);
    try {
      const match = targetUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
      if (!match) throw new Error('Invalid URL format. Use: https://github.com/owner/repo');
      
      const [_, owner, repo] = match;
      let fileCount = 0;
      
      const headers: Record<string, string> = {};
      if (githubToken) {
        headers['Authorization'] = `Bearer ${githubToken}`;
      }

      const fetchRepo = async (path: string = ''): Promise<FileNode[]> => {
        if (fileCount >= MAX_REPO_FILES) return [];
        
        const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, { headers });
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

            const contentRes = await fetch(item.download_url, { headers });
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
      setGitUrl('');
      setShowRepoSelect(false);
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
          return [...prev, { name: file.name, path, type: 'file', content, gitStatus: 'untracked' }];
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
    setCommandHistory(prev => [input, ...prev]);
    setHistoryIndex(-1);
    setInput('');
    setIsLoading(true);
    setActiveMainTab('terminal');

    try {
      const response = await gemini.chat([...messages, userMsg], files, selectedFile);
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

  const AUTOCOMPLETE_COMMANDS = [
    'git status', 'git add .', 'git commit -m ""', 'git push', 'git pull',
    'git branch', 'git checkout', 'git merge',
    '/analyze', '/refactor', '/explain', '/clear'
  ];

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const match = AUTOCOMPLETE_COMMANDS.find(c => c.startsWith(input.toLowerCase()));
      if (match) setInput(match);
    } else if (e.key === 'Enter') {
      handleSendMessage();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0 && historyIndex < commandHistory.length - 1) {
        const nextIndex = historyIndex + 1;
        setHistoryIndex(nextIndex);
        setInput(commandHistory[nextIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const prevIndex = historyIndex - 1;
        setHistoryIndex(prevIndex);
        setInput(commandHistory[prevIndex]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setInput('');
      }
    }
  };

  const handleAnalyze = async () => {
    if (!selectedFile || isLoading) return;
    setIsLoading(true);
    setActiveMainTab('terminal');
    setMessages(prev => [...prev, { role: 'user', text: `Analyze ${selectedFile.name}` }]);
    try {
      const response = await gemini.analyze(selectedFile, files);
      if (response) {
        setMessages(prev => [...prev, { role: 'model', text: response }]);
      }
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'model', text: `Error: ${err.message}` }]);
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
        {nodes.map((node, i) => {
          let snippet = null;
          if (searchTerm && node.type === 'file' && node.content) {
            let matchIndex = -1;
            if (useRegex) {
              try {
                const regex = new RegExp(searchTerm, 'i');
                const match = node.content.match(regex);
                if (match && match.index !== undefined) matchIndex = match.index;
              } catch (e) {}
            } else {
              matchIndex = node.content.toLowerCase().indexOf(searchTerm.toLowerCase());
            }
            if (matchIndex !== -1) {
              const start = Math.max(0, matchIndex - 15);
              const end = Math.min(node.content.length, matchIndex + searchTerm.length + 15);
              snippet = (start > 0 ? '...' : '') + node.content.substring(start, end).replace(/\n/g, ' ') + (end < node.content.length ? '...' : '');
            }
          }

          return (
            <div key={node.path + i}>
              <div 
                className={cn(
                  "data-row flex flex-col py-1.5 px-4 cursor-pointer text-xs font-mono",
                  selectedFile?.path === node.path ? "bg-[#004578] text-[#EEF9FD]" : "hover:bg-[#004578]/50"
                )}
                style={{ paddingLeft: `${(depth + 1) * 16}px` }}
                onClick={() => node.type === 'file' ? setSelectedFile(node) : null}
              >
                <div className="flex items-center w-full">
                  {node.type === 'dir' ? (
                    <span title="Directory"><Folder className="w-3 h-3 mr-2 opacity-80 text-[#F9F1A5] shrink-0" /></span>
                  ) : (
                    <span title="Source File"><FileCode className="w-3 h-3 mr-2 opacity-80 shrink-0" /></span>
                  )}
                  <span className="truncate flex-1">{node.name}</span>
                  {node.gitStatus === 'modified' && <span className="text-[10px] text-blue-400 font-bold ml-2" title="Modified">M</span>}
                  {node.gitStatus === 'untracked' && <span className="text-[10px] text-green-400 font-bold ml-2" title="Untracked">U</span>}
                </div>
                {snippet && (
                  <div className="text-[10px] opacity-60 truncate mt-1 pl-5 italic text-[#F9F1A5]">
                    {snippet}
                  </div>
                )}
              </div>
              {node.children && <FileTree nodes={node.children} depth={depth + 1} />}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex flex-col md:flex-row h-screen w-full overflow-hidden bg-[#012456] text-[#EEF9FD] font-mono">
      {/* Toast Notification */}
      {toast && (
        <div className="absolute top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 bg-[#000000] text-[#EEF9FD] border border-[#F9F1A5] rounded shadow-lg text-sm font-mono animate-in fade-in slide-in-from-top-4">
          {toast.type === 'error' ? <AlertCircle className="w-4 h-4 text-red-400" /> : <CheckCircle2 className="w-4 h-4 text-[#F9F1A5]" />}
          {toast.msg}
        </div>
      )}

      {/* Sidebar */}
      <aside className="w-full md:w-72 shrink-0 border-b md:border-b-0 md:border-r border-[#004578] flex flex-col bg-[#012456] h-[40vh] md:h-auto">
        <div className="p-4 border-b border-[#004578] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-[#EEF9FD]" />
            <h1 className="font-mono text-lg font-bold tracking-tight">PowerShell</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/" className="text-xs opacity-60 hover:opacity-100 hover:text-[#F9F1A5] transition-colors">
              Home
            </Link>
            <Link to="/classic" className="text-xs opacity-60 hover:opacity-100 hover:text-[#F9F1A5] transition-colors">
              Classic
            </Link>
          </div>
        </div>
        
        <div className="flex border-b border-[#004578] shrink-0">
          <button 
            className={cn("flex-1 py-2 text-xs font-mono border-r border-[#004578] transition-colors", activeSidebarTab === 'files' ? "bg-[#004578] text-[#EEF9FD]" : "hover:bg-[#004578]/50")} 
            onClick={() => setActiveSidebarTab('files')}
          >
            Files
          </button>
          <button 
            className={cn("flex-1 py-2 text-xs font-mono transition-colors", activeSidebarTab === 'tools' ? "bg-[#004578] text-[#EEF9FD]" : "hover:bg-[#004578]/50")} 
            onClick={() => setActiveSidebarTab('tools')}
          >
            Tools
          </button>
        </div>

        {activeSidebarTab === 'files' ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-[#004578] space-y-3 shrink-0">
              {githubToken ? (
                <div className="space-y-2">
                  <button 
                    onClick={() => fetchGithubRepos(githubToken)}
                    className="w-full flex items-center justify-center gap-2 py-2 border border-[#004578] text-xs font-mono hover:bg-[#004578] hover:text-[#EEF9FD] transition-colors"
                  >
                    <Code2 className="w-4 h-4" />
                    Select Repository
                  </button>
                  {showRepoSelect && githubRepos.length > 0 && (
                    <div className="max-h-32 overflow-y-auto border border-[#004578] bg-[#00183A]">
                      {githubRepos.map(repo => (
                        <button
                          key={repo.id}
                          onClick={() => handleImportGit(repo.html_url)}
                          className="w-full text-left px-3 py-2 text-xs font-mono hover:bg-[#004578] hover:text-[#EEF9FD] truncate"
                        >
                          {repo.full_name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <button 
                  onClick={handleConnectGithub}
                  className="w-full flex items-center justify-center gap-2 py-2 border border-[#004578] text-xs font-mono hover:bg-[#004578] hover:text-[#EEF9FD] transition-colors"
                >
                  <Code2 className="w-4 h-4" />
                  Connect GitHub
                </button>
              )}
              <div className="relative">
                <Github className="absolute left-2 top-2.5 w-4 h-4 opacity-60" />
                <input 
                  type="text"
                  placeholder="Or paste GitHub Repo URL"
                  className="w-full pl-8 pr-4 py-2 bg-[#00183A] border border-[#004578] text-xs font-mono focus:outline-none focus:border-[#F9F1A5]"
                  value={gitUrl}
                  onChange={(e) => setGitUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleImportGit()}
                />
                <button 
                  onClick={() => handleImportGit()}
                  disabled={isImporting}
                  className="absolute right-1 top-1 p-1.5 hover:bg-[#004578] transition-colors disabled:opacity-50"
                >
                  {isImporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                </button>
              </div>

              <label className="flex items-center justify-center gap-2 w-full py-2 border border-[#004578] border-dashed text-xs font-mono cursor-pointer hover:bg-[#004578] transition-colors">
                <Upload className="w-3 h-3" />
                Local Files
                <input type="file" multiple className="hidden" onChange={handleFileUpload} />
              </label>

              <div className="relative flex items-center">
                <Search className="absolute left-2 w-4 h-4 opacity-60" />
                <input 
                  type="text"
                  placeholder="Search files and content..."
                  className="w-full pl-8 pr-8 py-2 bg-[#00183A] border border-[#004578] text-xs font-mono focus:outline-none focus:border-[#F9F1A5]"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <button 
                  onClick={() => setUseRegex(!useRegex)} 
                  className={cn(
                    "absolute right-2 p-1 text-[10px] font-bold rounded transition-colors", 
                    useRegex ? "bg-[#004578] text-[#EEF9FD]" : "opacity-60 hover:opacity-100 hover:text-[#F9F1A5]"
                  )}
                  title="Use Regular Expression"
                >
                  .*
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="p-2 border-b border-[#004578] bg-[#00183A] sticky top-0 z-10">
                <span className="text-xs font-bold px-2 text-[#F9F1A5]">PS C:\Explorer&gt;</span>
              </div>
              {files.length === 0 ? (
                <div className="p-8 text-center opacity-60 flex flex-col items-center gap-2">
                  <Terminal className="w-8 h-8" />
                  <p className="text-[10px] font-mono uppercase tracking-widest">No files</p>
                </div>
              ) : (
                <FileTree nodes={filteredFiles} />
              )}
            </div>

            <div className="p-3 border-t border-[#004578] bg-[#00183A] flex items-center justify-between shrink-0">
              <span className="text-[10px] font-mono opacity-80">{files.length} items</span>
              <button onClick={() => setFiles([])} className="hover:text-red-400 transition-colors">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-1 gap-2">
              <button 
                onClick={handleAnalyze}
                disabled={isLoading || !selectedFile}
                className="flex items-center justify-center gap-2 py-2 border border-[#004578] bg-[#00183A] text-xs font-mono hover:bg-[#004578] transition-colors disabled:opacity-50"
              >
                <Activity className="w-4 h-4" />
                Analyze Code
              </button>
              <button 
                onClick={handleExplain}
                disabled={isLoading}
                className="flex items-center justify-center gap-2 py-2 border border-[#004578] bg-[#00183A] text-xs font-mono hover:bg-[#004578] transition-colors disabled:opacity-50"
              >
                <Search className="w-4 h-4" />
                Explain Code
              </button>
              <button 
                onClick={handleRefactor}
                disabled={isLoading || !selectedFile}
                className="flex items-center justify-center gap-2 py-2 border border-[#004578] bg-[#00183A] text-xs font-mono hover:bg-[#004578] transition-colors disabled:opacity-50"
              >
                <Code2 className="w-4 h-4" />
                Refactor
              </button>
              <button 
                onClick={() => handleGitGuide("Manage branches: create, list, switch, delete")}
                disabled={isLoading}
                className="flex items-center justify-center gap-2 py-2 border border-[#004578] bg-[#00183A] text-xs font-mono hover:bg-[#004578] transition-colors disabled:opacity-50"
              >
                <GitBranch className="w-4 h-4" />
                Branching Guide
              </button>
              <button 
                onClick={() => handleGitGuide("Stage changes and commit with a descriptive message")}
                disabled={isLoading}
                className="flex items-center justify-center gap-2 py-2 border border-[#004578] bg-[#00183A] text-xs font-mono hover:bg-[#004578] transition-colors disabled:opacity-50"
              >
                <GitCommit className="w-4 h-4" />
                Commit Guide
              </button>
              <button 
                onClick={() => handleGitGuide("Resolve merge conflicts")}
                disabled={isLoading}
                className="flex items-center justify-center gap-2 py-2 border border-[#004578] bg-[#00183A] text-xs font-mono hover:bg-[#004578] transition-colors disabled:opacity-50"
              >
                <GitMerge className="w-4 h-4" />
                Resolve Conflicts
              </button>
            </div>

            <div className="mt-6 border-t border-[#004578] pt-4">
              <h3 className="text-xs font-bold mb-3 uppercase tracking-widest opacity-80 text-[#F9F1A5]">Snippets</h3>
              <div className="space-y-2 mb-4">
                {snippets.map((s, i) => (
                  <div key={i} className="flex items-center justify-between p-2 border border-[#004578] bg-[#00183A]">
                    <span className="text-xs font-mono truncate flex-1">{s.name}</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => {
                        const blob = new Blob([s.code], { type: 'text/plain;charset=utf-8' });
                        saveAs(blob, `${s.name.replace(/\s+/g, '_')}.txt`);
                      }} className="p-1 hover:bg-[#004578] hover:text-[#EEF9FD] transition-colors" title="Export Snippet">
                        <Download className="w-3 h-3" />
                      </button>
                      <button onClick={() => insertSnippet(s.code)} className="p-1 hover:bg-[#004578] hover:text-[#F9F1A5] transition-colors" title="Insert Snippet">
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <input type="text" placeholder="Snippet Name" className="w-full px-2 py-1.5 bg-[#00183A] border border-[#004578] font-mono text-xs focus:outline-none focus:border-[#F9F1A5]" value={newSnippetName} onChange={e => setNewSnippetName(e.target.value)} />
                <textarea placeholder="Snippet Code" className="w-full px-2 py-1.5 bg-[#00183A] border border-[#004578] font-mono text-xs focus:outline-none focus:border-[#F9F1A5] resize-none h-20" value={newSnippetCode} onChange={e => setNewSnippetCode(e.target.value)} />
                <button onClick={handleSaveSnippet} className="w-full flex items-center justify-center gap-2 py-1.5 border border-[#004578] bg-[#00183A] text-[#EEF9FD] font-mono text-xs hover:bg-[#004578] transition-colors">
                  <Save className="w-3 h-3" /> Save Snippet
                </button>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 relative bg-[#012456]">
        <div className="flex border-b border-[#004578] bg-[#00183A] shrink-0 overflow-x-auto">
          <button 
            className={cn("px-4 md:px-6 py-2 text-xs font-mono border-r border-[#004578] transition-colors flex items-center gap-2 whitespace-nowrap", activeMainTab === 'terminal' ? "bg-[#004578] text-[#EEF9FD]" : "hover:bg-[#004578]/50")} 
            onClick={() => setActiveMainTab('terminal')}
          >
            <Terminal className="w-3 h-3" />
            Terminal
          </button>
          <button 
            className={cn("px-4 md:px-6 py-2 text-xs font-mono border-r border-[#004578] transition-colors flex items-center gap-2 whitespace-nowrap", activeMainTab === 'editor' ? "bg-[#004578] text-[#EEF9FD]" : "hover:bg-[#004578]/50")} 
            onClick={() => setActiveMainTab('editor')}
          >
            <FileCode className="w-3 h-3" />
            Editor
          </button>
          <button 
            className={cn("px-4 md:px-6 py-2 text-xs font-mono border-r border-[#004578] transition-colors flex items-center gap-2 whitespace-nowrap", activeMainTab === 'preview' ? "bg-[#004578] text-[#EEF9FD]" : "hover:bg-[#004578]/50")} 
            onClick={() => setActiveMainTab('preview')}
          >
            <LayoutTemplate className="w-3 h-3" />
            App Preview
          </button>
        </div>

        {activeMainTab === 'editor' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="h-10 border-b border-[#004578] flex items-center px-4 bg-[#00183A] justify-between shrink-0">
              <div className="flex items-center gap-2 overflow-hidden">
                <span className="text-xs font-mono truncate text-[#F9F1A5]">
                  PS C:\Editor&gt; {selectedFile?.path || 'Select a file to view'}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                {diffModified && showDiff && (
                  <>
                    <button 
                      onClick={() => {
                        const blob = new Blob([diffModified], { type: 'text/plain;charset=utf-8' });
                        saveAs(blob, `refactored_${selectedFile?.name}`);
                      }}
                      className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-mono border border-[#004578] hover:bg-[#004578] hover:text-[#EEF9FD] transition-colors"
                      title="Export Refactored Code"
                    >
                      <Download className="w-3 h-3" />
                      Export
                    </button>
                    <button 
                      onClick={applyRefactor}
                      className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-mono border border-[#004578] hover:bg-[#004578] hover:text-[#EEF9FD] transition-colors"
                    >
                      <Check className="w-3 h-3" />
                      Apply
                    </button>
                  </>
                )}
                {diffModified && (
                  <button 
                    onClick={() => setShowDiff(!showDiff)}
                    className={cn(
                      "flex items-center gap-1.5 px-2 py-1 text-[10px] font-mono border border-[#004578] transition-colors",
                      showDiff ? "bg-[#004578] text-[#EEF9FD]" : "hover:bg-[#004578] hover:text-[#EEF9FD]"
                    )}
                  >
                    <FileDiff className="w-3 h-3" />
                    {showDiff ? 'Hide Diff' : 'Show Diff'}
                  </button>
                )}
                {selectedFile && (
                  <button 
                    onClick={() => setIsEditing(!isEditing)}
                    className={cn(
                      "flex items-center gap-1.5 px-2 py-1 text-[10px] font-mono border border-[#004578] transition-colors",
                      isEditing ? "bg-[#004578] text-[#EEF9FD]" : "hover:bg-[#004578] hover:text-[#EEF9FD]"
                    )}
                  >
                    <Edit3 className="w-3 h-3" />
                    {isEditing ? 'View' : 'Edit'}
                  </button>
                )}
                {selectedFile && (
                  <button className="p-1 hover:bg-[#004578] transition-colors rounded">
                    <Download className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-[#012456] relative">
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
                            diffViewerBackground: '#012456',
                            diffViewerColor: '#EEF9FD',
                            addedBackground: '#004578',
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
              ) : isEditing && selectedFile ? (
                <textarea
                  value={selectedFile.content || ''}
                  onChange={(e) => updateFileContent(selectedFile.path, e.target.value)}
                  className="w-full h-full bg-[#012456] text-[#EEF9FD] font-mono text-[13px] p-5 focus:outline-none resize-none"
                  spellCheck={false}
                />
              ) : selectedFile ? (
                <SyntaxHighlighter 
                  language={selectedFile.name.split('.').pop() || 'javascript'} 
                  style={vscDarkPlus}
                  customStyle={{ margin: 0, padding: '20px', fontSize: '13px', fontFamily: 'var(--font-mono)', background: 'transparent' }}
                >
                  {selectedFile.content || ''}
                </SyntaxHighlighter>
              ) : (
                <div className="h-full flex items-center justify-center opacity-40 flex-col gap-4">
                  <Code2 className="w-16 h-16" />
                  <p className="font-mono text-xl">Import code to begin analysis</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeMainTab === 'terminal' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="h-10 border-b border-[#004578] flex items-center justify-between px-4 bg-[#00183A] shrink-0">
              <span className="text-xs font-bold text-[#F9F1A5]">Windows PowerShell</span>
              <button 
                onClick={handleExportChat}
                className="flex items-center gap-1.5 text-[10px] font-mono opacity-80 hover:opacity-100 hover:text-[#F9F1A5] transition-colors"
              >
                <Download className="w-3 h-3" />
                Export Chat
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono">
              <div className="text-xs opacity-80 mb-6">
                Windows PowerShell<br/>
                Copyright (C) Microsoft Corporation. All rights reserved.<br/><br/>
                Try the new cross-platform PowerShell https://aka.ms/pscore6
              </div>
              
              {messages.length === 0 && (
                <div className="text-xs">
                  <span className="text-[#F9F1A5]">PS C:\Users\GemCode&gt;</span> _
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={i} className="flex flex-col">
                  {msg.role === 'user' ? (
                    <div className="text-sm mb-2">
                      <span className="text-[#F9F1A5]">PS C:\Users\GemCode&gt;</span> {msg.text}
                    </div>
                  ) : (
                    <div className="text-sm mb-4 opacity-90 pl-4 border-l-2 border-[#004578]">
                      <div className="markdown-body text-[#EEF9FD]">
                        <Markdown>{msg.text}</Markdown>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {isLoading && (
                <div className="flex items-center gap-2 text-xs opacity-80">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Executing...
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="p-4 border-t border-[#004578] shrink-0 bg-[#00183A]">
              <div className="relative flex items-center">
                <span className="absolute left-4 text-[#F9F1A5] text-sm font-bold">PS&gt;</span>
                <input 
                  type="text"
                  placeholder={isLoading ? "Executing..." : "Type a command... (Use ↑/↓ for history)"}
                  className="w-full pl-12 pr-12 py-3 bg-transparent border border-[#004578] text-sm font-mono focus:outline-none focus:border-[#F9F1A5] disabled:opacity-50"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isLoading}
                />
                <button 
                  onClick={handleSendMessage}
                  disabled={isLoading || !input.trim()}
                  className="absolute right-2 p-2 hover:bg-[#004578] transition-colors disabled:opacity-20"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        )}

        {activeMainTab === 'preview' && (
          <div className="flex-1 flex flex-col overflow-hidden bg-white">
            <div className="h-10 border-b border-[#004578] flex items-center px-4 bg-[#00183A] shrink-0">
              <span className="text-xs font-bold text-[#F9F1A5]">PS C:\Preview&gt; index.html</span>
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
                <div className="h-full flex items-center justify-center opacity-60 flex-col gap-4 bg-[#012456]">
                  <LayoutTemplate className="w-16 h-16" />
                  <p className="font-mono text-xl">No index.html found in workspace to preview.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
