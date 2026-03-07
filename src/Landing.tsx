import React, { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Code2, Terminal, Download, Upload, Trash2, ShieldAlert, Palette, LayoutTemplate } from 'lucide-react';
import { saveAs } from 'file-saver';

export default function Landing() {
  const [theme, setTheme] = useState(localStorage.getItem('gemcode_theme') || 'light');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const handleThemeChange = (newTheme: string) => {
    setTheme(newTheme);
    localStorage.setItem('gemcode_theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  const handleExport = () => {
    const workspace = localStorage.getItem('gemcode_workspace');
    if (!workspace) {
      alert('No workspace data found to export.');
      return;
    }
    const blob = new Blob([workspace], { type: 'application/json' });
    saveAs(blob, 'gemcode-workspace.json');
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        JSON.parse(content); // Validate JSON
        localStorage.setItem('gemcode_workspace', content);
        alert('Workspace imported successfully!');
        navigate('/classic');
      } catch (err) {
        alert('Invalid workspace file.');
      }
    };
    reader.readAsText(file);
  };

  const handleClear = () => {
    if (window.confirm('Are you sure you want to clear your saved workspace?')) {
      localStorage.removeItem('gemcode_workspace');
      alert('Workspace cleared.');
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-color,#E4E3E0)] text-[var(--text-color,#141414)] font-mono p-8 flex flex-col items-center justify-center">
      <div className="max-w-3xl w-full space-y-12">
        
        <div className="text-center space-y-4">
          <div className="flex justify-center mb-6">
            <Code2 className="w-20 h-20" />
          </div>
          <h1 className="text-5xl font-serif italic font-bold tracking-tight">GemCode</h1>
          <p className="text-lg opacity-80">AI-Powered Code Assistant & Workspace</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Link to="/classic" className="flex flex-col items-center p-8 border-2 border-[var(--border-color,#141414)] hover:bg-[var(--primary-bg,#141414)] hover:text-[var(--primary-text,#E4E3E0)] transition-colors group">
            <LayoutTemplate className="w-12 h-12 mb-4" />
            <h2 className="text-xl font-bold mb-2">Classic Mode</h2>
            <p className="text-sm opacity-60 group-hover:opacity-100 text-center">Standard IDE interface with light, dark, and colorful themes.</p>
          </Link>
          <Link to="/powershell" className="flex flex-col items-center p-8 border-2 border-[var(--border-color,#141414)] hover:bg-[#004578] hover:text-[#EEF9FD] transition-colors group">
            <Terminal className="w-12 h-12 mb-4" />
            <h2 className="text-xl font-bold mb-2">PowerShell Mode</h2>
            <p className="text-sm opacity-60 group-hover:opacity-100 text-center">Immersive retro terminal experience for power users.</p>
          </Link>
        </div>

        <div className="bg-[var(--surface-color,#DCDAD7)] border border-[var(--border-color,#141414)] p-6 space-y-6">
          <h3 className="text-xl font-bold flex items-center gap-2 border-b border-[var(--border-color,#141414)] pb-4">
            <Palette className="w-5 h-5" /> Settings & Workspace
          </h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold mb-2">Theme (Classic Mode)</label>
              <div className="flex gap-4">
                {['light', 'dark', 'colorful'].map(t => (
                  <button 
                    key={t}
                    onClick={() => handleThemeChange(t)}
                    className={`px-4 py-2 border border-[var(--border-color,#141414)] capitalize ${theme === t ? 'bg-[var(--primary-bg,#141414)] text-[var(--primary-text,#E4E3E0)]' : 'hover:bg-[var(--border-color,#141414)] hover:text-[var(--bg-color,#E4E3E0)]'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold mb-2">Data Management</label>
              <div className="flex flex-wrap gap-4">
                <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 border border-[var(--border-color,#141414)] hover:bg-[var(--primary-bg,#141414)] hover:text-[var(--primary-text,#E4E3E0)] transition-colors">
                  <Download className="w-4 h-4" /> Export Workspace
                </button>
                <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 border border-[var(--border-color,#141414)] hover:bg-[var(--primary-bg,#141414)] hover:text-[var(--primary-text,#E4E3E0)] transition-colors">
                  <Upload className="w-4 h-4" /> Import Workspace
                </button>
                <input type="file" accept=".json" ref={fileInputRef} onChange={handleImport} className="hidden" />
                <button onClick={handleClear} className="flex items-center gap-2 px-4 py-2 border border-red-500 text-red-500 hover:bg-red-500 hover:text-white transition-colors">
                  <Trash2 className="w-4 h-4" /> Clear Saved Data
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="text-xs opacity-60 flex items-start gap-3 p-4 border border-[var(--border-color,#141414)]">
          <ShieldAlert className="w-6 h-6 shrink-0" />
          <p>
            <strong>Legal & Privacy Disclaimer:</strong> This application interfaces with the public GitHub API to fetch repository contents. By using the GitHub import feature, you agree to comply with GitHub's Acceptable Use Policies and Terms of Service. We do not store your code on any external servers; all workspace data is saved locally in your browser's storage, and processing is done directly via the Gemini API. Do not use this tool to scrape sensitive data or overload GitHub's infrastructure. Rate limits apply.
          </p>
        </div>

      </div>
    </div>
  );
}
