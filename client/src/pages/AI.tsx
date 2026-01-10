import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AIAssistant } from "@/components/AIAssistant";

export default function AI() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <header className="bg-zinc-900 border-b border-zinc-800 p-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon" data-testid="back-button">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <h1 className="text-xl font-bold">AI Developer Assistant</h1>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 overflow-hidden">
        <AIAssistant />
      </main>
    </div>
  );
}
