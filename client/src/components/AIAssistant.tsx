import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Bot, Send, Plus, Trash2, Code, FileCode, Check, X, ChevronDown, ChevronUp, Wifi, WifiOff, Settings } from "lucide-react";
import { Link } from "wouter";

interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

interface Conversation {
  id: number;
  title: string;
  createdAt: string;
  messages?: Message[];
}

interface CodeBlock {
  filePath: string;
  content: string;
  language: string;
}

function parseCodeBlocks(content: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  const regex = /```(?:file:)?([^\n]*)\n([\s\S]*?)```/g;
  let match;
  
  while ((match = regex.exec(content)) !== null) {
    const header = match[1].trim();
    const code = match[2].trim();
    
    if (header.includes("/") || header.includes(".")) {
      blocks.push({
        filePath: header.replace(/^file:/, "").trim(),
        content: code,
        language: header.split(".").pop() || "text",
      });
    }
  }
  
  return blocks;
}

function MessageContent({ content, onApplyCode }: { content: string; onApplyCode: (code: CodeBlock) => void }) {
  const codeBlocks = parseCodeBlocks(content);
  
  const parts = content.split(/(```(?:file:)?[^\n]*\n[\s\S]*?```)/g);
  
  return (
    <div className="prose prose-invert prose-sm max-w-none">
      {parts.map((part, idx) => {
        const blockMatch = part.match(/```(?:file:)?([^\n]*)\n([\s\S]*?)```/);
        if (blockMatch) {
          const header = blockMatch[1].trim();
          const code = blockMatch[2].trim();
          const isFilePath = header.includes("/") || header.includes(".");
          
          return (
            <div key={idx} className="my-2 rounded-lg overflow-hidden border border-zinc-700">
              <div className="bg-zinc-800 px-3 py-1 text-xs text-zinc-400 flex justify-between items-center">
                <span>{header || "code"}</span>
                {isFilePath && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-xs"
                    onClick={() => onApplyCode({ filePath: header, content: code, language: header.split(".").pop() || "text" })}
                    data-testid={`apply-code-${idx}`}
                  >
                    <FileCode className="w-3 h-3 mr-1" />
                    Apply
                  </Button>
                )}
              </div>
              <pre className="bg-zinc-900 p-3 overflow-x-auto text-xs">
                <code>{code}</code>
              </pre>
            </div>
          );
        }
        
        return <span key={idx} className="whitespace-pre-wrap">{part}</span>;
      })}
    </div>
  );
}

export function AIAssistant() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [showConversations, setShowConversations] = useState(false);
  const [reviewDialog, setReviewDialog] = useState<{ open: boolean; code: CodeBlock | null; review: string | null; loading: boolean }>({
    open: false,
    code: null,
    review: null,
    loading: false,
  });
  const [ollamaStatus, setOllamaStatus] = useState<{ connected: boolean; model: string; url: string }>({
    connected: false,
    model: "",
    url: "",
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchConversations();
    checkOllamaStatus();
  }, []);

  async function checkOllamaStatus() {
    try {
      const res = await fetch("/api/ai/status");
      const data = await res.json();
      setOllamaStatus({
        connected: data.connected,
        model: data.model || "tinyllama",
        url: data.url || "http://localhost:11434",
      });
    } catch (error) {
      console.error("Failed to check Ollama status:", error);
    }
  }

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  async function fetchConversations() {
    try {
      const res = await fetch("/api/ai/conversations");
      const data = await res.json();
      setConversations(data);
    } catch (error) {
      console.error("Failed to fetch conversations:", error);
    }
  }

  async function loadConversation(id: number) {
    try {
      const res = await fetch(`/api/ai/conversations/${id}`);
      const data = await res.json();
      setCurrentConversation(data);
      setMessages(data.messages || []);
      setShowConversations(false);
    } catch (error) {
      console.error("Failed to load conversation:", error);
    }
  }

  async function createConversation() {
    try {
      const res = await fetch("/api/ai/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New Chat" }),
      });
      const data = await res.json();
      setConversations([data, ...conversations]);
      setCurrentConversation(data);
      setMessages([]);
      setShowConversations(false);
    } catch (error) {
      console.error("Failed to create conversation:", error);
    }
  }

  async function deleteConversation(id: number) {
    try {
      await fetch(`/api/ai/conversations/${id}`, { method: "DELETE" });
      setConversations(conversations.filter((c) => c.id !== id));
      if (currentConversation?.id === id) {
        setCurrentConversation(null);
        setMessages([]);
      }
    } catch (error) {
      console.error("Failed to delete conversation:", error);
    }
  }

  async function sendMessage() {
    if (!input.trim() || isLoading) return;
    
    let conversationId = currentConversation?.id;
    
    if (!conversationId) {
      try {
        const res = await fetch("/api/ai/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "New Chat" }),
        });
        const newConversation = await res.json();
        setConversations([newConversation, ...conversations]);
        setCurrentConversation(newConversation);
        conversationId = newConversation.id;
      } catch (error) {
        console.error("Failed to create conversation:", error);
        return;
      }
    }
    
    if (!conversationId) return;

    const userMessage: Message = {
      id: Date.now(),
      role: "user",
      content: input,
      createdAt: new Date().toISOString(),
    };
    
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setStreamingContent("");

    try {
      const res = await fetch(`/api/ai/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: input }),
      });

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No reader available");

      const decoder = new TextDecoder();
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) {
                fullContent += data.content;
                setStreamingContent(fullContent);
              }
              if (data.done) {
                const assistantMessage: Message = {
                  id: Date.now() + 1,
                  role: "assistant",
                  content: fullContent,
                  createdAt: new Date().toISOString(),
                };
                setMessages((prev) => [...prev, assistantMessage]);
                setStreamingContent("");
              }
            } catch (e) {}
          }
        }
      }
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleApplyCode(code: CodeBlock) {
    setReviewDialog({ open: true, code, review: null, loading: true });
    
    try {
      const res = await fetch("/api/ai/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath: code.filePath, proposedChanges: code.content }),
      });
      const data = await res.json();
      setReviewDialog((prev) => ({ ...prev, review: data.review, loading: false }));
    } catch (error) {
      setReviewDialog((prev) => ({ ...prev, review: "Failed to get review", loading: false }));
    }
  }

  async function confirmApplyCode() {
    if (!reviewDialog.code) return;
    
    try {
      const res = await fetch("/api/ai/apply-changes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath: reviewDialog.code.filePath, content: reviewDialog.code.content }),
      });
      const data = await res.json();
      if (data.success) {
        setReviewDialog({ open: false, code: null, review: null, loading: false });
      }
    } catch (error) {
      console.error("Failed to apply changes:", error);
    }
  }

  return (
    <Card className="h-full flex flex-col bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bot className="w-5 h-5 text-blue-400" />
            AI Developer
            {ollamaStatus.connected ? (
              <span className="flex items-center gap-1 text-xs font-normal text-green-400" title={`Connected to ${ollamaStatus.url}`}>
                <Wifi className="w-3 h-3" />
                {ollamaStatus.model}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs font-normal text-red-400" title="Ollama not connected">
                <WifiOff className="w-3 h-3" />
                Offline
              </span>
            )}
          </CardTitle>
          <div className="flex gap-2">
            <Link href="/settings">
              <Button variant="outline" size="sm" data-testid="ai-settings">
                <Settings className="w-4 h-4" />
              </Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowConversations(!showConversations)}
              data-testid="toggle-conversations"
            >
              {showConversations ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
            <Button variant="outline" size="sm" onClick={createConversation} data-testid="new-chat">
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>
        
        {showConversations && (
          <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={`flex items-center justify-between p-2 rounded cursor-pointer hover:bg-zinc-800 ${
                  currentConversation?.id === conv.id ? "bg-zinc-800" : ""
                }`}
                onClick={() => loadConversation(conv.id)}
                data-testid={`conversation-${conv.id}`}
              >
                <span className="text-sm truncate">{conv.title}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteConversation(conv.id);
                  }}
                  data-testid={`delete-conversation-${conv.id}`}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardHeader>

      <CardContent className="flex-1 flex flex-col overflow-hidden p-3">
        <ScrollArea className="flex-1 pr-4" ref={scrollRef}>
          <div className="space-y-4">
            {messages.length === 0 && !streamingContent && (
              <div className="text-center text-zinc-500 py-8">
                <Bot className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p className="text-sm">Ask me to help with code, fix bugs, or add features!</p>
                <p className="text-xs mt-2 opacity-75">I can read and write files in your project.</p>
              </div>
            )}
            
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-4 py-2 ${
                    msg.role === "user"
                      ? "bg-blue-600 text-white"
                      : "bg-zinc-800 text-zinc-100"
                  }`}
                  data-testid={`message-${msg.id}`}
                >
                  {msg.role === "assistant" ? (
                    <MessageContent content={msg.content} onApplyCode={handleApplyCode} />
                  ) : (
                    <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                  )}
                </div>
              </div>
            ))}
            
            {streamingContent && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-lg px-4 py-2 bg-zinc-800 text-zinc-100">
                  <MessageContent content={streamingContent} onApplyCode={handleApplyCode} />
                </div>
              </div>
            )}
            
            {isLoading && !streamingContent && (
              <div className="flex justify-start">
                <div className="bg-zinc-800 rounded-lg px-4 py-2">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="flex gap-2 mt-3 flex-shrink-0">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
            placeholder="Ask me anything..."
            className="flex-1 bg-zinc-800 border-zinc-700"
            disabled={isLoading}
            data-testid="chat-input"
          />
          <Button onClick={sendMessage} disabled={isLoading || !input.trim()} data-testid="send-message">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>

      <Dialog open={reviewDialog.open} onOpenChange={(open) => !open && setReviewDialog({ open: false, code: null, review: null, loading: false })}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Code className="w-5 h-5" />
              Review Code Changes
            </DialogTitle>
          </DialogHeader>
          
          {reviewDialog.code && (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-zinc-400 mb-2">File: {reviewDialog.code.filePath}</p>
                <pre className="bg-zinc-900 p-3 rounded-lg text-xs overflow-x-auto max-h-48">
                  <code>{reviewDialog.code.content}</code>
                </pre>
              </div>
              
              <div>
                <p className="text-sm font-semibold mb-2">AI Review:</p>
                {reviewDialog.loading ? (
                  <div className="text-zinc-500">Analyzing code...</div>
                ) : (
                  <div className="bg-zinc-900 p-3 rounded-lg text-sm whitespace-pre-wrap">
                    {reviewDialog.review}
                  </div>
                )}
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReviewDialog({ open: false, code: null, review: null, loading: false })}
              data-testid="cancel-apply"
            >
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
            <Button
              onClick={confirmApplyCode}
              disabled={reviewDialog.loading}
              data-testid="confirm-apply"
            >
              <Check className="w-4 h-4 mr-2" />
              Apply Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
