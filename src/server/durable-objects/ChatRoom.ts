import { DurableObject } from "cloudflare:workers";
import { z } from "zod";

const MessageSchema = z.object({
  type: z.enum(["chat", "system", "attachment", "typing", "read_receipt"]),
  project_id: z.string(),
  sender_id: z.string(),
  sender_name: z.string().optional(),
  content: z.string().optional(),
  attachment_url: z.string().optional(),
  attachment_hash: z.string().optional(),
  timestamp: z.number(),
  reply_to: z.string().optional(),
  read_by: z.array(z.string()).optional(),
});

type Env = {
  PROJECT_MESSAGES: D1Database;
};

export class ChatRoom extends DurableObject<Env> {
  private sessions: Map<WebSocket, { userId: string }> = new Map();
  private projectId: string;
  private typingUsers: Map<string, number> = new Map();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.projectId = ctx.id.toString();
  }

  async fetch(request: Request): Promise<Response> {
    const upgrade = request.headers.get("Upgrade");
    if (upgrade?.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket", { status: 400 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    client.accept();

    this.ctx.acceptWebSocket(client);
    this.sessions.set(client, { userId: "" });

    client.addEventListener("message", (event: MessageEvent) => {
      void this.handleMessage(client, event.data as string);
    });

    client.addEventListener("close", () => {
      const session = this.sessions.get(client);
      if (session) {
        this.typingUsers.delete(session.userId);
        this.broadcastTyping();
      }
      this.sessions.delete(client);
    });

    client.addEventListener("error", () => {
      const session = this.sessions.get(client);
      if (session) {
        this.typingUsers.delete(session.userId);
        this.broadcastTyping();
      }
      this.sessions.delete(client);
    });

    return new Response(null, { status: 101, webSocket: server });
  }

  private async handleMessage(ws: WebSocket, raw: string): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.sendError(ws, "INVALID_JSON", "Payload no es JSON válido");
      return;
    }

    const result = MessageSchema.safeParse(parsed);
    if (!result.success) {
      this.sendError(ws, "VALIDATION_ERROR", result.error.flatten());
      return;
    }

    const message = result.data;

    if (message.type === "typing") {
      const session = this.sessions.get(ws);
      if (session && message.sender_id) {
        session.userId = message.sender_id;
        this.typingUsers.set(message.sender_id, Date.now());
        setTimeout(() => {
          if (this.typingUsers.get(message.sender_id) === Date.now() - 0) {
            this.typingUsers.delete(message.sender_id);
          }
        }, 3000);
        this.broadcastTyping();
      }
      return;
    }

    if (message.type === "read_receipt" && message.read_by) {
      const payload = JSON.stringify({
        type: "read_receipt",
        project_id: message.project_id,
        sender_id: message.sender_id,
        read_by: message.read_by,
        timestamp: message.timestamp,
      });
      this.broadcast(payload);
      return;
    }

    if (!message.content) {
      this.sendError(ws, "MISSING_CONTENT", "Se requiere contenido");
      return;
    }

    const sanitizedContent = this.sanitize(message.content);
    const session = this.sessions.get(ws);
    if (session && !session.userId) {
      session.userId = message.sender_id;
    }

    const broadcastMessage = {
      id: crypto.randomUUID(),
      type: message.type,
      project_id: message.project_id,
      sender_id: message.sender_id,
      sender_name: message.sender_name,
      content: sanitizedContent,
      attachment_url: message.attachment_url,
      attachment_hash: message.attachment_hash,
      reply_to: message.reply_to,
      timestamp: message.timestamp,
    };

    await this.persistMessage(broadcastMessage);

    const payload = JSON.stringify(broadcastMessage);
    this.broadcast(payload);
  }

  private broadcast(payload: string): void {
    for (const [ws] of this.sessions) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }

  private broadcastTyping(): void {
    const now = Date.now();
    for (const [userId, time] of this.typingUsers) {
      if (now - time > 3000) {
        this.typingUsers.delete(userId);
      }
    }
    const payload = JSON.stringify({
      type: "typing_indicators",
      project_id: this.projectId,
      users: Array.from(this.typingUsers.keys()),
      timestamp: now,
    });
    this.broadcast(payload);
  }

  private async persistMessage(message: {
    id: string;
    type: string;
    project_id: string;
    sender_id: string;
    sender_name?: string;
    content: string;
    attachment_url?: string;
    attachment_hash?: string;
    reply_to?: string;
    timestamp: number;
  }): Promise<void> {
    await this.env.PROJECT_MESSAGES.execute(
      `INSERT INTO project_messages (id, project_id, sender_id, content, attachment_url, attachment_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        message.id,
        message.project_id,
        message.sender_id,
        message.content,
        message.attachment_url ?? null,
        message.attachment_hash ?? null,
        message.timestamp,
      ]
    );
  }

  private sendError(ws: WebSocket, code: string, detail: unknown): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "error", code, detail, timestamp: Date.now() }));
    }
  }

  private sanitize(content: string): string {
    return content
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  async webSocketMessage(ws: WebSocket, message: string): Promise<void> {
    await this.handleMessage(ws, message);
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    const session = this.sessions.get(ws);
    if (session?.userId) {
      this.typingUsers.delete(session.userId);
      this.broadcastTyping();
    }
    this.sessions.delete(ws);
  }
}
