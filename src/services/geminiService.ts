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

  private flattenFiles(nodes: FileNode[]): string {
    let context = "";
    const traverse = (node: FileNode) => {
      if (node.type === 'file' && node.content) {
        context += `\n--- FILE: ${node.path} ---\n${node.content}\n`;
      }
      if (node.children) {
        node.children.forEach(traverse);
      }
    };
    nodes.forEach(traverse);
    return context;
  }

  async chat(messages: ChatMessage[], files: FileNode[]) {
    const context = this.flattenFiles(files);
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
    const context = this.flattenFiles(allFiles);
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
    const context = this.flattenFiles(allFiles);
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
