/** AI operations assistant endpoints. */
import { zValidator } from "@hono/zod-validator";
import { asc, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { agentAskSchema } from "../../shared/schemas.js";
import { db, schema } from "../db/client.js";
import { ask, isClaudeConfigured } from "../ai/agent.js";
import { TOOL_NAMES } from "../ai/tools.js";
import { type AppEnv, requireRole } from "../middleware/auth.js";

const { agentConversations, agentMessages } = schema;

export const agentRoutes = new Hono<AppEnv>();

/** Engine status, so the UI can say honestly which advisor is answering. */
agentRoutes.get("/agent/status", c =>
  c.json({
    claudeConfigured: isClaudeConfigured(),
    model: process.env.ANTHROPIC_MODEL ?? "claude-opus-5",
    tools: TOOL_NAMES,
    offlineFallback: true,
  })
);

agentRoutes.get("/agent/conversations", requireRole("staff", "officer"), async c => {
  const user = c.get("user");
  const rows = await db
    .select()
    .from(agentConversations)
    .where(eq(agentConversations.userId, user.userId))
    .orderBy(desc(agentConversations.createdAt))
    .limit(20);
  return c.json({ conversations: rows });
});

agentRoutes.get("/agent/conversations/:id", requireRole("staff", "officer"), async c => {
  const user = c.get("user");
  const conversationId = Number(c.req.param("id"));

  const [convo] = await db
    .select()
    .from(agentConversations)
    .where(eq(agentConversations.conversationId, conversationId))
    .limit(1);
  if (!convo) throw new HTTPException(404, { message: "Conversation not found" });
  if (convo.userId !== user.userId) {
    throw new HTTPException(403, { message: "That conversation belongs to another user" });
  }

  const messages = await db
    .select()
    .from(agentMessages)
    .where(eq(agentMessages.conversationId, conversationId))
    .orderBy(asc(agentMessages.messageId));

  return c.json({ conversation: convo, messages });
});

agentRoutes.post(
  "/agent/ask",
  requireRole("staff", "officer"),
  zValidator("json", agentAskSchema),
  async c => {
    const user = c.get("user");
    const { message, conversationId } = c.req.valid("json");

    // Resolve or open a conversation thread.
    let convoId = conversationId;
    if (convoId) {
      const [convo] = await db
        .select()
        .from(agentConversations)
        .where(eq(agentConversations.conversationId, convoId))
        .limit(1);
      if (!convo || convo.userId !== user.userId) {
        throw new HTTPException(403, { message: "That conversation belongs to another user" });
      }
    } else {
      const [created] = await db
        .insert(agentConversations)
        .values({
          userId: user.userId,
          title: message.slice(0, 60) + (message.length > 60 ? "…" : ""),
        })
        .returning({ conversationId: agentConversations.conversationId });
      convoId = created.conversationId;
    }

    // Replay prior turns so the assistant has thread context.
    const prior = await db
      .select({ role: agentMessages.role, content: agentMessages.content })
      .from(agentMessages)
      .where(eq(agentMessages.conversationId, convoId))
      .orderBy(asc(agentMessages.messageId))
      .limit(20);

    await db.insert(agentMessages).values({
      conversationId: convoId,
      role: "user",
      content: message,
    });

    const reply = await ask(message, prior);

    await db.insert(agentMessages).values({
      conversationId: convoId,
      role: "assistant",
      content: reply.text,
      toolCallsJson: JSON.stringify(reply.toolCalls),
      source: reply.source,
    });

    return c.json({
      conversationId: convoId,
      reply: reply.text,
      source: reply.source,
      toolCalls: reply.toolCalls,
      fallbackReason: reply.fallbackReason ?? null,
    });
  }
);
