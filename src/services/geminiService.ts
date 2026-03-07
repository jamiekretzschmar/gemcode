import { GoogleGenAI } from "@google/genai";
import { ChatMessage, FileNode } from "../types";

export class GeminiService {
  private ai: GoogleGenAI;
  private model: string = "gemini-3.1-pro-preview";

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set");
    }
    this.ai = new GoogleGenAI({ apiKey });
  }

  private flattenFiles(nodes: FileNode[], selectedFile?: FileNode | null, query?: string): string {
    let context = "";
    const MAX_CONTEXT_LENGTH = 100000; // Arbitrary limit to prevent token overflow
    let currentLength = 0;

    // Flatten all files into a flat array
    const allFiles: FileNode[] = [];
    const traverse = (node: FileNode) => {
      if (node.type === 'file' && node.content) {
        allFiles.push(node);
      }
      if (node.children) {
        node.children.forEach(traverse);
      }
    };
    nodes.forEach(traverse);

    // Prioritize files: 1. Selected file, 2. Files matching query, 3. Others
    const queryTerms = query ? query.toLowerCase().split(' ') : [];
    
    const scoreFile = (file: FileNode) => {
      let score = 0;
      if (selectedFile && file.path === selectedFile.path) score += 1000;
      if (queryTerms.length > 0) {
        const contentLower = file.content?.toLowerCase() || '';
        const nameLower = file.name.toLowerCase();
        queryTerms.forEach(term => {
          if (nameLower.includes(term)) score += 50;
          if (contentLower.includes(term)) score += 10;
        });
      }
      return score;
    };

    allFiles.sort((a, b) => scoreFile(b) - scoreFile(a));

    for (const file of allFiles) {
      const fileString = `\n--- FILE: ${file.path} ---\n${file.content}\n`;
      if (currentLength + fileString.length > MAX_CONTEXT_LENGTH) {
        // If it's the selected file, we must include it, even if we truncate
        if (selectedFile && file.path === selectedFile.path) {
          context += `\n--- FILE: ${file.path} (TRUNCATED) ---\n${file.content?.substring(0, MAX_CONTEXT_LENGTH - currentLength)}\n`;
        } else {
          context += `\n--- FILE: ${file.path} (OMITTED DUE TO CONTEXT LIMIT) ---\n`;
        }
        break; // Stop adding full files
      } else {
        context += fileString;
        currentLength += fileString.length;
      }
    }

    return context;
  }

  async chat(messages: ChatMessage[], files: FileNode[], selectedFile?: FileNode | null) {
    const lastMessage = messages[messages.length - 1]?.text || '';
    const context = this.flattenFiles(files, selectedFile, lastMessage);
    const systemInstruction = `You are GemCode, a high-reasoning expert coding assistant. 
    You have access to the following codebase context:
    ${context}
    
    Analyze the code deeply. Help the user with refactoring, debugging, explaining, or exporting specific logic.
    Be precise, technical, and concise. Use markdown for code blocks.`;

    const response = await this.ai.models.generateContent({
      model: this.model,
      contents: messages.map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
      })),
      config: {
        systemInstruction,
      }
    });

    return response.text;
  }

  async refactor(file: FileNode, allFiles: FileNode[]) {
    const context = this.flattenFiles(allFiles, file);
    const prompt = `Review the following file and provide concrete suggestions for refactoring to enhance code quality, optimize performance, and improve maintainability.
    
    FILE TO REFACTOR: ${file.path}
    CONTENT:
    ${file.content}
    
    Consider the broader context of the project if available. Provide specific code snippets for the improvements.`;

    const response = await this.ai.models.generateContent({
      model: this.model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        systemInstruction: `You are a world-class software architect. Focus on clean code, SOLID principles, and performance optimization. Context: ${context}`,
      }
    });
    return response.text;
  }

  async explain(file: FileNode | null, allFiles: FileNode[]) {
    const context = this.flattenFiles(allFiles, file);
    const target = file ? `FILE: ${file.path}\nCONTENT:\n${file.content}` : "the entire repository";
    const prompt = `Provide a detailed, easy-to-understand explanation of the functionality, structure, and key components of ${target}.
    
    Break it down for someone who is new to the codebase but experienced in programming.`;

    const response = await this.ai.models.generateContent({
      model: this.model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        systemInstruction: `You are a technical lead explaining a codebase to a new senior hire. Be thorough but clear. Context: ${context}`,
      }
    });
    return response.text;
  }

  async analyze(file: FileNode, allFiles: FileNode[]) {
    const context = this.flattenFiles(allFiles, file);
    const prompt = `Analyze the following file. Identify its main dependencies, and flag any obvious syntax errors, potential runtime issues, or security vulnerabilities.
    
    FILE TO ANALYZE: ${file.path}
    CONTENT:
    ${file.content}
    
    Provide a structured analysis.`;

    const response = await this.ai.models.generateContent({
      model: this.model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        systemInstruction: `You are a senior code reviewer and static analysis tool. Be precise and highlight critical issues. Context: ${context}`,
      }
    });
    return response.text;
  }

  async gitGuide(task: string) {
    const prompt = `Guide the user through the following Git task: "${task}".
    Provide step-by-step terminal commands and explain what each one does. 
    If it's about merge conflicts, explain the strategy for resolution.
    If it's about commits, suggest descriptive message patterns.`;

    const response = await this.ai.models.generateContent({
      model: this.model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        systemInstruction: "You are a Git expert. Provide clear, safe, and professional git workflows.",
      }
    });
    return response.text;
  }
}
