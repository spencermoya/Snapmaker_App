import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bot, Send, Plus, Trash2, GitBranch, GitCommit, Upload, RefreshCw, Loader2 } from "lucide-react";
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
  const [inputText, setInputText] = useState("");
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(null);
  const [displayMessages, setDisplayMessages] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [commitMsg, setCommitMsg] = useState("");
  const [isCommitting, setIsCommitting] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch AI status
  const { data: aiStatus } = useQuery<{ connected: boolean; url: string; model: string; error?: string }>({
    queryKey: ["/api/ai/status"],
    refetchInterval: 30000,
  });

  // Fetch conversations list
  const { data: conversationsList = [], refetch: refetchConversations } = useQuery<Conversation[]>({
    queryKey: ["/api/ai/conversations"],
  });

  // Fetch git status
  const { data: gitStatus, refetch: refetchGit } = useQuery<GitStatus>({
    queryKey: ["/api/ai/git/status"],
    refetchInterval: 10000,
  });

  // Load messages when conversation changes (but not while sending)
  useEffect(() => {
    if (currentConversationId && !isSending) {
      loadMessages(currentConversationId);
    } else if (!currentConversationId) {
      setDisplayMessages([]);
    }
  }, [currentConversationId, isSending]);

  // Auto-scroll when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [displayMessages, streamingText]);

  // Select first conversation when panel opens
  useEffect(() => {
    if (open && conversationsList.length > 0 && !currentConversationId) {
      setCurrentConversationId(conversationsList[0].id);
    }
  }, [open, conversationsList, currentConversationId]);

  async function loadMessages(convId: number) {
    try {
      const res = await fetch(`/api/ai/conversations/${convId}`);
      if (res.ok) {
        const data = await res.json();
        setDisplayMessages(data.messages || []);
      }
    } catch (err) {
      console.error("Failed to load messages:", err);
    }
  }

  async function createNewConversation(): Promise<number | null> {
    try {
      const res = await fetch("/api/ai/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New Chat" }),
      });
      if (!res.ok) throw new Error("Failed to create conversation");
      const data = await res.json();
      await refetchConversations();
      return data.id;
    } catch (err) {
      console.error("Failed to create conversation:", err);
      toast.error("Failed to create conversation");
      return null;
    }
  }

  async function deleteConversation(id: number) {
    try {
      // Clear current conversation first if we're deleting it
      const wasCurrentConversation = currentConversationId === id;
      if (wasCurrentConversation) {
        setCurrentConversationId(null);
        setDisplayMessages([]);
      }
      await fetch(`/api/ai/conversations/${id}`, { method: "DELETE" });
      const result = await refetchConversations();
      // Select another conversation if available and we deleted the current one
      if (wasCurrentConversation && result.data && result.data.length > 0) {
        setCurrentConversationId(result.data[0].id);
      }
      // If no conversations remain, currentConversationId stays null (correct behavior)
    } catch (err) {
      toast.error("Failed to delete conversation");
    }
  }

  // THE MAIN SEND FUNCTION - completely rebuilt
  async function handleSendMessage() {
    const messageText = inputText.trim();
    
    // Validate input
    if (!messageText) {
      toast.error("Please type a message first");
      return;
    }
    
    if (isSending) {
      toast.error("Already sending a message");
      return;
    }

    // Clear input immediately for responsive feel
    setInputText("");
    setIsSending(true);
    setStreamingText("");

    try {
      // Get or create conversation
      let convId = currentConversationId;
      if (!convId) {
        convId = await createNewConversation();
        if (!convId) {
          setIsSending(false);
          setInputText(messageText); // Restore input on failure
          return;
        }
        setCurrentConversationId(convId);
      }

      // Add user message to display immediately
      const userMessage: Message = {
        id: Date.now(),
        role: "user",
        content: messageText,
        createdAt: new Date().toISOString(),
      };
      setDisplayMessages(prev => [...prev, userMessage]);

      // Send to API
      const response = await fetch(`/api/ai/conversations/${convId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: messageText }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to send message");
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response stream available");
      }

      const decoder = new TextDecoder();
      let fullResponse = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n").filter(line => line.trim());

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const jsonData = JSON.parse(line.slice(6));
              if (jsonData.content) {
                fullResponse += jsonData.content;
                setStreamingText(fullResponse);
              }
              if (jsonData.error) {
                toast.error(jsonData.error);
              }
            } catch (parseErr) {
              // Ignore parse errors for incomplete JSON
            }
          }
        }
      }

      // Add assistant message to display (no need to reload from server)
      if (fullResponse) {
        const assistantMessage: Message = {
          id: Date.now() + 1,
          role: "assistant",
          content: fullResponse,
          createdAt: new Date().toISOString(),
        };
        setDisplayMessages(prev => [...prev, assistantMessage]);
      }

    } catch (err: any) {
      console.error("Send message error:", err);
      toast.error(err.message || "Failed to send message to AI");
    } finally {
      setIsSending(false);
      setStreamingText("");
    }
  }

  async function handleGitCommit() {
    if (!commitMsg.trim()) {
      toast.error("Please enter a commit message");
      return;
    }
    setIsCommitting(true);
    try {
      const res = await fetch("/api/ai/git/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: commitMsg }),
      });
      if (!res.ok) throw new Error("Failed to commit");
      const data = await res.json();
      toast.success(data.message || "Committed successfully");
      setCommitMsg("");
      refetchGit();
    } catch (err: any) {
      toast.error(err.message || "Failed to commit");
    } finally {
      setIsCommitting(false);
    }
  }

  async function handleGitPush() {
    setIsPushing(true);
    try {
      const res = await fetch("/api/ai/git/push", { method: "POST" });
      if (!res.ok) throw new Error("Failed to push");
      const data = await res.json();
      toast.success(data.message || "Pushed successfully");
      refetchGit();
    } catch (err: any) {
      toast.error(err.message || "Failed to push");
    } finally {
      setIsPushing(false);
    }
  }

  async function handleAppRestart() {
    try {
      const res = await fetch("/api/ai/restart", { method: "POST" });
      if (!res.ok) throw new Error("Failed to restart");
      const data = await res.json();
      toast.success(data.message || "App restarting...");
    } catch (err: any) {
      toast.error(err.message || "Failed to restart app");
    }
  }

  function formatMessageContent(content: string) {
    // Simple code block formatting
    const codeBlockRegex = /```(\w+)?\n?([\s\S]*?)```/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      // Add text before code block
      if (match.index > lastIndex) {
        parts.push(
          <span key={lastIndex} className="whitespace-pre-wrap">
            {content.slice(lastIndex, match.index)}
          </span>
        );
      }

      // Add code block
      const [, lang, code] = match;
      parts.push(
        <pre key={match.index} className="bg-zinc-900 rounded p-2 my-2 overflow-x-auto text-xs">
          <code className={lang ? `language-${lang}` : ""}>{code.trim()}</code>
        </pre>
      );

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < content.length) {
      parts.push(
        <span key={lastIndex} className="whitespace-pre-wrap">
          {content.slice(lastIndex)}
        </span>
      );
    }

    return parts.length > 0 ? parts : <span className="whitespace-pre-wrap">{content}</span>;
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          size="icon"
          className="fixed bottom-4 right-4 h-14 w-14 rounded-full shadow-lg z-50"
          data-testid="button-open-ai-chat"
        >
          <Bot className="h-6 w-6" />
        </Button>
      </SheetTrigger>

      <SheetContent side="right" className="w-full sm:w-[440px] p-0 flex flex-col">
        <SheetHeader className="p-4 border-b">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              AI Assistant
            </SheetTitle>
            <Badge variant={aiStatus?.connected ? "default" : "secondary"}>
              {aiStatus?.connected ? "Online" : "Offline"}
            </Badge>
          </div>
        </SheetHeader>

        <Tabs defaultValue="chat" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="mx-4 mt-2">
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="git">Git</TabsTrigger>
          </TabsList>

          {/* CHAT TAB */}
          <TabsContent value="chat" className="flex-1 flex flex-col overflow-hidden m-0">
            {/* Conversation selector */}
            <div className="p-2 border-b flex items-center gap-2 overflow-x-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const newId = await createNewConversation();
                  if (newId) setCurrentConversationId(newId);
                }}
                data-testid="button-new-conversation"
              >
                <Plus className="h-4 w-4 mr-1" />
                New
              </Button>
              {conversationsList.map(conv => (
                <div key={conv.id} className="flex items-center gap-1">
                  <Button
                    variant={currentConversationId === conv.id ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setCurrentConversationId(conv.id)}
                    data-testid={`button-conversation-${conv.id}`}
                  >
                    {conv.title}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => deleteConversation(conv.id)}
                    data-testid={`button-delete-conversation-${conv.id}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Messages area */}
            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
              <div className="space-y-4">
                {displayMessages.map((msg) => (
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
                      {formatMessageContent(msg.content)}
                    </div>
                  </div>
                ))}

                {/* Streaming message */}
                {streamingText && (
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm bg-muted">
                      {formatMessageContent(streamingText)}
                      <span className="inline-block w-2 h-4 ml-1 bg-primary animate-pulse" />
                    </div>
                  </div>
                )}

                {/* Empty state */}
                {displayMessages.length === 0 && !streamingText && (
                  <div className="text-center text-muted-foreground py-8">
                    <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="text-sm">Ask me to help with printer issues or app changes.</p>
                    {!aiStatus?.connected && (
                      <p className="text-xs text-amber-500 mt-2">
                        Ollama not connected. Make sure it's running on your Pi.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Input area - FORM-BASED FOR iOS SAFARI RELIABILITY */}
            <form 
              className="p-4 border-t"
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!isSending && inputText.trim()) {
                  handleSendMessage();
                }
              }}
            >
              <div className="flex gap-2">
                <Input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Type your message..."
                  disabled={isSending}
                  autoComplete="off"
                  autoCorrect="off"
                  data-testid="input-ai-message"
                />
                <button
                  type="submit"
                  disabled={isSending || !inputText.trim()}
                  className="inline-flex items-center justify-center h-12 w-12 min-w-[48px] min-h-[48px] rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none"
                  style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                  data-testid="button-send-message"
                >
                  {isSending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Send className="h-5 w-5" />
                  )}
                </button>
              </div>
            </form>
          </TabsContent>

          {/* GIT TAB */}
          <TabsContent value="git" className="flex-1 flex flex-col overflow-hidden m-0 p-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <GitBranch className="h-4 w-4" />
                  <span className="text-sm font-medium">{gitStatus?.branch || "main"}</span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => refetchGit()}>
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
                          <span
                            className={`font-mono ${
                              change.status === "M"
                                ? "text-amber-500"
                                : change.status === "A"
                                ? "text-green-500"
                                : change.status === "D"
                                ? "text-red-500"
                                : ""
                            }`}
                          >
                            {change.status}
                          </span>
                          <span className="truncate">{change.file}</span>
                        </div>
                      ))}
                    </ScrollArea>
                  </div>

                  <div className="space-y-2">
                    <Input
                      value={commitMsg}
                      onChange={(e) => setCommitMsg(e.target.value)}
                      placeholder="Commit message..."
                      data-testid="input-commit-message"
                    />
                    <div className="flex gap-2">
                      <Button
                        className="flex-1"
                        onClick={handleGitCommit}
                        disabled={isCommitting || !commitMsg.trim()}
                        data-testid="button-git-commit"
                      >
                        {isCommitting ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <GitCommit className="h-4 w-4 mr-2" />
                        )}
                        Commit
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleGitPush}
                        disabled={isPushing}
                        data-testid="button-git-push"
                      >
                        {isPushing ? (
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
                  <GitBranch className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No changes to commit</p>
                </div>
              )}

              <div className="pt-4 border-t">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleAppRestart}
                  data-testid="button-restart-app"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Restart App
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
