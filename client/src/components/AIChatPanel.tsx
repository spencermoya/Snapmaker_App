import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bot, Send, X, Plus, Trash2, FileCode, GitBranch, GitCommit, Upload, RefreshCw, Loader2, AlertCircle, Check } from "lucide-react";
import { toast } from "sonner";

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
}

interface GitStatus {
  branch: string;
  changes: { status: string; file: string }[];
  hasChanges: boolean;
}

export default function AIChatPanel() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [activeConversation, setActiveConversation] = useState<number | null>(null);
  const [streamingMessage, setStreamingMessage] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: aiStatus } = useQuery<{ connected: boolean; url: string; model: string; error?: string }>({
    queryKey: ["/api/ai/status"],
    refetchInterval: 30000,
  });

  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ["/api/ai/conversations"],
  });

  const { data: conversationData } = useQuery<Conversation & { messages: Message[] }>({
    queryKey: ["/api/ai/conversations", activeConversation],
    enabled: !!activeConversation,
  });

  const { data: gitStatus, refetch: refetchGit } = useQuery<GitStatus>({
    queryKey: ["/api/ai/git/status"],
    refetchInterval: 10000,
  });

  const messages = conversationData?.messages || [];

  const createConversation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/ai/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New Chat" }),
      });
      if (!res.ok) throw new Error("Failed to create conversation");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/conversations"] });
      setActiveConversation(data.id);
    },
  });

  const deleteConversation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/ai/conversations/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/conversations"] });
      if (conversations.length > 1) {
        setActiveConversation(conversations.find(c => c.id !== activeConversation)?.id || null);
      } else {
        setActiveConversation(null);
      }
    },
  });

  const gitCommit = useMutation({
    mutationFn: async (message: string) => {
      const res = await fetch("/api/ai/git/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) throw new Error("Failed to commit");
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(data.message);
      setCommitMessage("");
      refetchGit();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const gitPush = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/ai/git/push", { method: "POST" });
      if (!res.ok) throw new Error("Failed to push");
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(data.message);
      refetchGit();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const restartApp = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/ai/restart", { method: "POST" });
      if (!res.ok) throw new Error("Failed to restart");
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(data.message);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const sendMessage = async () => {
    if (!input.trim() || isStreaming) return;

    const userMessage = input;
    setInput("");
    setIsStreaming(true);
    setStreamingMessage("");

    try {
      let conversationId = activeConversation;
      
      if (!conversationId) {
        const createRes = await fetch("/api/ai/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "New Chat" }),
        });
        if (!createRes.ok) {
          throw new Error("Failed to create conversation");
        }
        const newConversation = await createRes.json();
        conversationId = newConversation.id;
        setActiveConversation(conversationId);
        queryClient.invalidateQueries({ queryKey: ["/api/ai/conversations"] });
      }

      const response = await fetch(`/api/ai/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: userMessage }),
      });

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader");

      const decoder = new TextDecoder();
      let fullMessage = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n").filter(Boolean);

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) {
                fullMessage += data.content;
                setStreamingMessage(fullMessage);
              }
              if (data.error) {
                toast.error(data.error);
              }
            } catch {}
          }
        }
      }

      queryClient.invalidateQueries({ queryKey: ["/api/ai/conversations", conversationId] });
    } catch (error: any) {
      toast.error(error?.message || "Failed to send message");
    } finally {
      setIsStreaming(false);
      setStreamingMessage("");
    }
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingMessage]);

  useEffect(() => {
    if (open && conversations.length === 0) {
      createConversation.mutate();
    } else if (open && !activeConversation && conversations.length > 0) {
      setActiveConversation(conversations[0].id);
    }
  }, [open, conversations]);

  const formatMessage = (content: string) => {
    const codeBlockRegex = /```(\w+)?:?([\w./]*)\n([\s\S]*?)```/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push(
          <span key={lastIndex} className="whitespace-pre-wrap">
            {content.slice(lastIndex, match.index)}
          </span>
        );
      }

      const [, lang, filePath, code] = match;
      parts.push(
        <div key={match.index} className="my-2 rounded-md bg-zinc-900 overflow-hidden">
          {(lang || filePath) && (
            <div className="flex items-center gap-2 px-3 py-1 bg-zinc-800 text-xs text-zinc-400">
              <FileCode className="h-3 w-3" />
              {filePath || lang}
            </div>
          )}
          <pre className="p-3 text-xs overflow-x-auto">
            <code>{code.trim()}</code>
          </pre>
        </div>
      );
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < content.length) {
      parts.push(
        <span key={lastIndex} className="whitespace-pre-wrap">
          {content.slice(lastIndex)}
        </span>
      );
    }

    return parts.length > 0 ? parts : <span className="whitespace-pre-wrap">{content}</span>;
  };

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 h-14 w-14 rounded-full shadow-lg z-50"
        size="icon"
        data-testid="button-ai-chat"
      >
        <Bot className="h-6 w-6" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:w-[480px] p-0 flex flex-col">
          <SheetHeader className="p-4 border-b">
            <div className="flex items-center justify-between">
              <SheetTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                AI Assistant
                {aiStatus?.connected ? (
                  <Badge variant="outline" className="text-green-500 border-green-500/50">
                    <Check className="h-3 w-3 mr-1" /> Online
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-red-500 border-red-500/50">
                    <AlertCircle className="h-3 w-3 mr-1" /> Offline
                  </Badge>
                )}
              </SheetTitle>
            </div>
          </SheetHeader>

          <Tabs defaultValue="chat" className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="mx-4 mt-2">
              <TabsTrigger value="chat" className="flex-1">Chat</TabsTrigger>
              <TabsTrigger value="git" className="flex-1">
                <GitBranch className="h-4 w-4 mr-1" />
                Git
                {gitStatus?.hasChanges && (
                  <span className="ml-1 h-2 w-2 rounded-full bg-amber-500" />
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="chat" className="flex-1 flex flex-col overflow-hidden m-0 mt-2">
              <div className="flex gap-2 px-4 pb-2 border-b overflow-x-auto">
                {conversations.map((conv) => (
                  <div
                    key={conv.id}
                    className={`shrink-0 text-xs flex items-center gap-1 px-3 py-1.5 rounded-md cursor-pointer transition-colors ${
                      activeConversation === conv.id 
                        ? "bg-secondary text-secondary-foreground" 
                        : "hover:bg-accent hover:text-accent-foreground"
                    }`}
                    onClick={() => setActiveConversation(conv.id)}
                  >
                    {conv.title}
                    <button
                      className="ml-1 hover:text-red-500"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteConversation.mutate(conv.id);
                      }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  onClick={() => createConversation.mutate()}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              <ScrollArea className="flex-1 p-4" ref={scrollRef}>
                <div className="space-y-4">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        }`}
                      >
                        {formatMessage(msg.content)}
                      </div>
                    </div>
                  ))}
                  {streamingMessage && (
                    <div className="flex justify-start">
                      <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm bg-muted">
                        {formatMessage(streamingMessage)}
                        <span className="inline-block w-2 h-4 ml-1 bg-primary animate-pulse" />
                      </div>
                    </div>
                  )}
                  {messages.length === 0 && !streamingMessage && (
                    <div className="text-center text-muted-foreground py-8">
                      <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p className="text-sm">
                        Ask me to help with printer issues or app changes.
                      </p>
                      {!aiStatus?.connected && (
                        <p className="text-xs text-amber-500 mt-2">
                          Ollama not connected. Make sure it's running.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </ScrollArea>

              <div className="p-4 border-t">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    sendMessage();
                  }}
                  className="flex gap-2"
                >
                  <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask anything..."
                    disabled={isStreaming}
                    data-testid="input-ai-message"
                  />
                  <Button
                    type="submit"
                    size="icon"
                    disabled={isStreaming || !input.trim()}
                    data-testid="button-send-message"
                    onClick={(e) => {
                      e.preventDefault();
                      sendMessage();
                    }}
                  >
                    {isStreaming ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </form>
              </div>
            </TabsContent>

            <TabsContent value="git" className="flex-1 flex flex-col overflow-hidden m-0 p-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <GitBranch className="h-4 w-4" />
                    <span className="text-sm font-medium">{gitStatus?.branch || "main"}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => refetchGit()}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>

                {gitStatus?.hasChanges ? (
                  <>
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">
                        Changed Files ({gitStatus.changes.length})
                      </p>
                      <ScrollArea className="h-32 rounded-md border p-2">
                        {gitStatus.changes.map((change, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs py-1">
                            <span className={`font-mono ${
                              change.status === "M" ? "text-amber-500" :
                              change.status === "A" ? "text-green-500" :
                              change.status === "D" ? "text-red-500" : ""
                            }`}>
                              {change.status}
                            </span>
                            <span className="truncate">{change.file}</span>
                          </div>
                        ))}
                      </ScrollArea>
                    </div>

                    <div className="space-y-2">
                      <Input
                        value={commitMessage}
                        onChange={(e) => setCommitMessage(e.target.value)}
                        placeholder="Commit message..."
                        data-testid="input-commit-message"
                      />
                      <div className="flex gap-2">
                        <Button
                          onClick={() => gitCommit.mutate(commitMessage)}
                          disabled={!commitMessage.trim() || gitCommit.isPending}
                          className="flex-1"
                          data-testid="button-git-commit"
                        >
                          {gitCommit.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <GitCommit className="h-4 w-4 mr-2" />
                          )}
                          Commit
                        </Button>
                        <Button
                          onClick={() => gitPush.mutate()}
                          disabled={gitPush.isPending}
                          variant="outline"
                          data-testid="button-git-push"
                        >
                          {gitPush.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Upload className="h-4 w-4 mr-2" />
                          )}
                          Push
                        </Button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center text-muted-foreground py-8">
                    <Check className="h-8 w-8 mx-auto mb-2 text-green-500" />
                    <p className="text-sm">All changes committed</p>
                  </div>
                )}

                <div className="pt-4 border-t">
                  <Button
                    onClick={() => restartApp.mutate()}
                    disabled={restartApp.isPending}
                    variant="outline"
                    className="w-full"
                    data-testid="button-restart-app"
                  >
                    {restartApp.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Rebuild & Restart App
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>
    </>
  );
}
