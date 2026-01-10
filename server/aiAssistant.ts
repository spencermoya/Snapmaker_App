import type { Express, Request, Response } from "express";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { chatStorage } from "./replit_integrations/chat/storage";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const ALLOWED_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".json", ".css", ".html", ".md"];
const EXCLUDED_DIRS = ["node_modules", ".git", "dist", "build", ".next", "coverage"];

function isAllowedFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ALLOWED_EXTENSIONS.includes(ext);
}

function listProjectFiles(dir: string, basePath: string = ""): string[] {
  const files: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.join(basePath, entry.name);
      
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRS.includes(entry.name)) {
          files.push(...listProjectFiles(fullPath, relativePath));
        }
      } else if (isAllowedFile(entry.name)) {
        files.push(relativePath);
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error);
  }
  return files;
}

function readFileContent(filePath: string): string | null {
  try {
    const fullPath = path.join(process.cwd(), filePath);
    if (!fs.existsSync(fullPath)) return null;
    if (!isAllowedFile(filePath)) return null;
    return fs.readFileSync(fullPath, "utf-8");
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
    return null;
  }
}

function writeFileContent(filePath: string, content: string): boolean {
  try {
    const fullPath = path.join(process.cwd(), filePath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(fullPath, content, "utf-8");
    return true;
  } catch (error) {
    console.error(`Error writing file ${filePath}:`, error);
    return false;
  }
}

const SYSTEM_PROMPT = `You are an AI developer assistant for a Snapmaker 3D printer control app. You can:

1. **Answer questions** about the codebase, printer operations, and 3D printing
2. **Read files** to understand the current implementation
3. **Suggest code changes** with specific file modifications
4. **Write code** when asked to implement features

When suggesting code changes, format them clearly using this structure:
\`\`\`file:path/to/file.ts
// Your code here
\`\`\`

For partial edits, describe what lines to change.

The app uses:
- React 18 with TypeScript for frontend
- Express with TypeScript for backend  
- Tailwind CSS for styling
- Drizzle ORM with PostgreSQL
- shadcn/ui components
- Wouter for routing

Key directories:
- client/src/pages/ - Page components
- client/src/components/ - UI components
- server/ - Backend API routes
- shared/schema.ts - Database schema

Be helpful, concise, and provide working code. When asked to implement something, provide complete code that can be copy-pasted.`;

export function registerAIRoutes(app: Express): void {
  app.get("/api/ai/files", async (req: Request, res: Response) => {
    try {
      const files = listProjectFiles(process.cwd());
      res.json({ files });
    } catch (error) {
      console.error("Error listing files:", error);
      res.status(500).json({ error: "Failed to list files" });
    }
  });

  app.get("/api/ai/file", async (req: Request, res: Response) => {
    try {
      const filePath = req.query.path as string;
      if (!filePath) {
        return res.status(400).json({ error: "File path required" });
      }
      const content = readFileContent(filePath);
      if (content === null) {
        return res.status(404).json({ error: "File not found or not allowed" });
      }
      res.json({ path: filePath, content });
    } catch (error) {
      console.error("Error reading file:", error);
      res.status(500).json({ error: "Failed to read file" });
    }
  });

  app.post("/api/ai/file", async (req: Request, res: Response) => {
    try {
      const { path: filePath, content } = req.body;
      if (!filePath || content === undefined) {
        return res.status(400).json({ error: "Path and content required" });
      }
      if (!isAllowedFile(filePath)) {
        return res.status(400).json({ error: "File type not allowed" });
      }
      const success = writeFileContent(filePath, content);
      if (!success) {
        return res.status(500).json({ error: "Failed to write file" });
      }
      res.json({ success: true, path: filePath });
    } catch (error) {
      console.error("Error writing file:", error);
      res.status(500).json({ error: "Failed to write file" });
    }
  });

  app.get("/api/ai/conversations", async (req: Request, res: Response) => {
    try {
      const conversations = await chatStorage.getAllConversations();
      res.json(conversations);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  app.get("/api/ai/conversations/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const conversation = await chatStorage.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      const messages = await chatStorage.getMessagesByConversation(id);
      res.json({ ...conversation, messages });
    } catch (error) {
      console.error("Error fetching conversation:", error);
      res.status(500).json({ error: "Failed to fetch conversation" });
    }
  });

  app.post("/api/ai/conversations", async (req: Request, res: Response) => {
    try {
      const { title } = req.body;
      const conversation = await chatStorage.createConversation(title || "New Chat");
      res.status(201).json(conversation);
    } catch (error) {
      console.error("Error creating conversation:", error);
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  app.delete("/api/ai/conversations/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await chatStorage.deleteConversation(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting conversation:", error);
      res.status(500).json({ error: "Failed to delete conversation" });
    }
  });

  app.post("/api/ai/conversations/:id/messages", async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(req.params.id);
      const { content, includeFile } = req.body;

      let messageContent = content;
      if (includeFile) {
        const fileContent = readFileContent(includeFile);
        if (fileContent) {
          messageContent = `File: ${includeFile}\n\`\`\`\n${fileContent}\n\`\`\`\n\n${content}`;
        }
      }

      await chatStorage.createMessage(conversationId, "user", messageContent);

      const messages = await chatStorage.getMessagesByConversation(conversationId);
      const chatMessages = [
        { role: "system" as const, content: SYSTEM_PROMPT },
        ...messages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ];

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const stream = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages: chatMessages,
        stream: true,
        max_completion_tokens: 4096,
      });

      let fullResponse = "";

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          fullResponse += content;
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      }

      await chatStorage.createMessage(conversationId, "assistant", fullResponse);

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Error sending message:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Failed to get AI response" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Failed to send message" });
      }
    }
  });

  app.post("/api/ai/review", async (req: Request, res: Response) => {
    try {
      const { filePath, proposedChanges } = req.body;
      
      if (!filePath || !proposedChanges) {
        return res.status(400).json({ error: "File path and proposed changes required" });
      }

      const currentContent = readFileContent(filePath);
      
      const reviewPrompt = `Review these proposed code changes:

Current file (${filePath}):
\`\`\`
${currentContent || "File does not exist"}
\`\`\`

Proposed changes:
\`\`\`
${proposedChanges}
\`\`\`

Analyze the changes and respond with:
1. Summary of what the changes do
2. Any potential issues or bugs
3. Suggestions for improvement
4. Whether you recommend applying these changes (yes/no with reason)

Format your response clearly.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages: [
          { role: "system", content: "You are a senior code reviewer. Review code changes for correctness, best practices, and potential issues." },
          { role: "user", content: reviewPrompt },
        ],
        max_completion_tokens: 2048,
      });

      const review = response.choices[0]?.message?.content || "Unable to generate review";
      res.json({ review });
    } catch (error) {
      console.error("Error reviewing code:", error);
      res.status(500).json({ error: "Failed to review code" });
    }
  });

  app.post("/api/ai/apply-changes", async (req: Request, res: Response) => {
    try {
      const { filePath, content } = req.body;
      
      if (!filePath || content === undefined) {
        return res.status(400).json({ error: "File path and content required" });
      }

      if (!isAllowedFile(filePath)) {
        return res.status(400).json({ error: "File type not allowed" });
      }

      const normalizedPath = path.normalize(filePath);
      if (normalizedPath.startsWith("..") || path.isAbsolute(normalizedPath)) {
        return res.status(400).json({ error: "Invalid file path" });
      }

      const currentContent = readFileContent(filePath);
      
      const backupPath = `${filePath}.backup`;
      if (currentContent) {
        writeFileContent(backupPath, currentContent);
      }

      const success = writeFileContent(filePath, content);
      if (!success) {
        return res.status(500).json({ error: "Failed to apply changes" });
      }

      res.json({ 
        success: true, 
        message: "Changes applied successfully",
        backupPath: currentContent ? backupPath : null,
      });
    } catch (error) {
      console.error("Error applying changes:", error);
      res.status(500).json({ error: "Failed to apply changes" });
    }
  });

  app.post("/api/ai/revert", async (req: Request, res: Response) => {
    try {
      const { filePath } = req.body;
      
      if (!filePath) {
        return res.status(400).json({ error: "File path required" });
      }

      const backupPath = `${filePath}.backup`;
      const backupContent = readFileContent(backupPath);
      
      if (!backupContent) {
        return res.status(404).json({ error: "No backup found for this file" });
      }

      const success = writeFileContent(filePath, backupContent);
      if (!success) {
        return res.status(500).json({ error: "Failed to revert changes" });
      }

      fs.unlinkSync(path.join(process.cwd(), backupPath));

      res.json({ success: true, message: "Changes reverted successfully" });
    } catch (error) {
      console.error("Error reverting changes:", error);
      res.status(500).json({ error: "Failed to revert changes" });
    }
  });
}
