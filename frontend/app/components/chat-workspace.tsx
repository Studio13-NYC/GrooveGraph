"use client";

import { useMemo, useRef, useState } from "react";
import { Loader2, RefreshCcw, Send } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { LlmChatTurnResponse } from "@/query-builder/chat-contract";
import { getApiBase, getAuthHeaders } from "@/lib/api-base";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { GraphView2D } from "./exploration-graph-cytoscape";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type GraphPayload = {
  nodes: Array<{
    id: string;
    label: string;
    name: string;
    labels?: string[];
    nodeKind?: "focus" | "entity";
    entityLabel?: string;
  }>;
  links: Array<{
    source: string;
    target: string;
    type: string;
  }>;
  focusNodeId?: string;
};

type QueryStateForExecute = {
  start: {
    label: string;
    propertyKey: string;
    value: string;
  };
  steps: Array<{
    relationshipType: string;
    direction: "outbound" | "inbound";
    target: {
      label: string;
      propertyKey: string;
      value: string;
    };
  }>;
  limit?: number;
};

type ExecuteResponse = {
  graph?: GraphPayload;
  error?: string;
};

export function ChatWorkspace() {
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string>("");
  const [llmState, setLlmState] = useState<{ conversationId?: string; previousResponseId?: string } | undefined>(
    undefined,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [graph, setGraph] = useState<GraphPayload>({ nodes: [], links: [] });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [lastQueryState, setLastQueryState] = useState<QueryStateForExecute | null>(null);
  const graphContainerRef = useRef<HTMLDivElement | null>(null);
  const emptyRecentEnrichedNodeIds = useMemo(() => new Set<string>(), []);
  const canSend = chatInput.trim().length > 0;

  async function sendMessage(rawMessage?: string) {
    const message = (rawMessage ?? chatInput).trim();
    if (!message || loading) return;

    setLoading(true);
    setError(null);
    setMessages((current) => [...current, { role: "user", content: message }]);
    setChatInput("");

    try {
      const requestBody = {
        prompt: message,
        userMessage: message,
        mode: "new_intent",
        sessionId: sessionId || undefined,
        llmState,
      };
      const response = await fetch(`${getApiBase()}/api/query-builder/interpret`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify(requestBody),
      });
      const payload = (await response.json()) as LlmChatTurnResponse | { error?: string };
      if (!response.ok) {
        throw new Error("error" in payload && payload.error ? payload.error : "Failed to send message");
      }

      const turn = payload as LlmChatTurnResponse & {
        answerMarkdown?: string;
        summary?: string;
        followUpQuestion?: string;
        needsFollowUp?: boolean;
        queryState?: QueryStateForExecute;
        llmGraph?: GraphPayload;
      };
      setSessionId(turn.sessionId);
      setLlmState(turn.llmState);
      const assistantText =
        turn.assistant?.text ||
        turn.answerMarkdown ||
        turn.followUpQuestion ||
        turn.summary ||
        "I couldn't produce a response.";
      setMessages((current) => [...current, { role: "assistant", content: assistantText }]);

      // Graph should reflect interpreted LLM state, not a separate neighborhood guess.
      if (turn.queryState) {
        setLastQueryState(turn.queryState);
        try {
          const executeResponse = await fetch(`${getApiBase()}/api/query-builder/execute`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...getAuthHeaders(),
            },
            body: JSON.stringify({ queryState: turn.queryState }),
          });
          const executePayload = (await executeResponse.json()) as ExecuteResponse;
          if (!executeResponse.ok) {
            throw new Error(executePayload.error ?? "Failed to execute interpreted graph query");
          }
          const graphPayload = executePayload.graph;
          if (graphPayload) {
            const nextGraph = {
              nodes: Array.isArray(graphPayload.nodes) ? graphPayload.nodes : [],
              links: Array.isArray(graphPayload.links) ? graphPayload.links : [],
              focusNodeId: graphPayload.focusNodeId,
            };
            if (nextGraph.nodes.length > 0) {
              setGraph(nextGraph);
              setSelectedNodeId(nextGraph.focusNodeId ?? nextGraph.nodes?.[0]?.id ?? null);
            } else {
              const llmGraph = turn.llmGraph;
              if (llmGraph && Array.isArray(llmGraph.nodes) && llmGraph.nodes.length > 0) {
                setGraph(llmGraph);
                setSelectedNodeId(llmGraph.focusNodeId ?? llmGraph.nodes?.[0]?.id ?? null);
              } else {
                setGraph({ nodes: [], links: [] });
                setSelectedNodeId(null);
              }
            }
          }
        } catch {
          // Graph is secondary and should not block chat answer rendering.
        }
        return;
      }
      // Strict mode: no neighborhood fallback graph in chat mode.
      setLastQueryState(null);
      setGraph({ nodes: [], links: [] });
      setSelectedNodeId(null);
    } catch (sendError) {
      const text = sendError instanceof Error ? sendError.message : "Failed to send message";
      setError(text);
      setMessages((current) => [...current, { role: "assistant", content: `I hit an error: ${text}` }]);
    } finally {
      setLoading(false);
    }
  }

  function resetConversation() {
    setMessages([]);
    setSessionId("");
    setLlmState(undefined);
    setChatInput("");
    setError(null);
    setLastQueryState(null);
    setGraph({ nodes: [], links: [] });
    setSelectedNodeId(null);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <Card className="shadow-md lg:col-span-5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Search</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-h-[28rem] space-y-3 overflow-auto rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/20 p-4">
            {messages.length === 0 ? (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">Start with a natural-language request.</p>
            ) : (
              messages.map((message, index) => (
                <div
                  key={`message-${index}`}
                  className={`rounded-xl px-4 py-3 text-sm shadow-sm ${
                    message.role === "user"
                      ? "ml-8 border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))]"
                      : "mr-8 border border-blue-200 bg-gradient-to-b from-blue-50 to-white text-blue-900"
                  }`}
                >
                  <p className="mb-1 text-[10px] uppercase tracking-wide opacity-70">
                    {message.role === "user" ? "You" : "Assistant"}
                  </p>
                  {message.role === "assistant" ? (
                    <div className="prose prose-sm max-w-none text-blue-900 prose-headings:text-blue-950 prose-p:my-2 prose-li:my-0.5">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="flex gap-2">
            <Input
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              onKeyDown={(event) => {
                // Keep keyboard events local to chat input.
                event.stopPropagation();
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage(chatInput);
                }
              }}
              placeholder={messages.length > 0 ? "" : "What can I find for you?"}
            />
            <Button type="button" className="min-w-24" onClick={() => void sendMessage(chatInput)} disabled={loading || !canSend}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Send
            </Button>
            <Button type="button" variant="ghost" onClick={resetConversation}>
              Reset
            </Button>
          </div>

          {error ? <p className="text-xs text-red-600">{error}</p> : null}
        </CardContent>
      </Card>

      <Card className="shadow-md lg:col-span-7">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Graph</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                if (!lastQueryState) return;
                try {
                  const response = await fetch(`${getApiBase()}/api/query-builder/execute`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      ...getAuthHeaders(),
                    },
                    body: JSON.stringify({ queryState: lastQueryState }),
                  });
                  const payload = (await response.json()) as ExecuteResponse;
                  if (response.ok && payload.graph) {
                    setGraph(payload.graph);
                    setSelectedNodeId(payload.graph.focusNodeId ?? payload.graph.nodes?.[0]?.id ?? null);
                  } else {
                    setGraph({ nodes: [], links: [] });
                    setSelectedNodeId(null);
                  }
                } catch {
                  // keep current graph state
                }
              }}
              disabled={loading || !lastQueryState}
            >
              <RefreshCcw className="mr-2 h-4 w-4" />
              Refresh graph
            </Button>
          </div>
          <div
            ref={graphContainerRef}
            className="relative h-[36rem] overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] lg:h-[42rem]"
          >
            {graph.nodes.length === 0 ? (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm text-[hsl(var(--muted-foreground))]">
                No graph for this turn.
              </div>
            ) : (
              <GraphView2D
                graphData={graph}
                focusNodeId={selectedNodeId ?? graph.focusNodeId}
                expandedTypeKeys={[]}
                onNodeClick={(node) => setSelectedNodeId(node.id)}
                onNodeDragEnd={() => {}}
                showEdgeLabels={false}
                highlightEnriched={false}
                recentEnrichedNodeIds={emptyRecentEnrichedNodeIds}
                containerRef={graphContainerRef}
              />
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

