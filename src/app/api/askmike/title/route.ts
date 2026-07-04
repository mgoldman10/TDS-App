import { NextRequest, NextResponse } from "next/server";
import { ANTHROPIC_MODEL, ANTHROPIC_VERSION } from "@/lib/ai-config";
import { apiAuthErrorResponse, verifyApiCaller } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

interface IncomingMessage {
  role: "user" | "assistant";
  content: string;
}

export async function POST(request: NextRequest) {
  try {
    // Any valid login may use AskMike — the gate is against anonymous
    // internet callers burning our Anthropic budget, not against roles.
    await verifyApiCaller(request);

    const body = await request.json();
    const { messages } = body as { messages: IncomingMessage[] };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "Missing messages" }, { status: 400 });
    }

    // Cap request size (same rationale as the main AskMike route).
    const totalChars = messages.reduce(
      (sum, m) => sum + (typeof m.content === "string" ? m.content.length : 0),
      0
    );
    if (messages.length > 100 || totalChars > 50_000) {
      return NextResponse.json(
        { error: "Request too large." },
        { status: 413 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API key not configured" }, { status: 500 });
    }

    const transcript = messages
      .map((m) => `${m.role === "user" ? "User" : "Coach"}: ${m.content}`)
      .join("\n\n");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 40,
        system:
          "You write very short titles for coaching conversations. Reply with 4–6 words that capture the topic, in Title Case, with no punctuation or quotation marks. Do not include the words 'coaching' or 'conversation'. Respond with only the title text.",
        messages: [
          {
            role: "user",
            content: `Title this conversation:\n\n${transcript}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Anthropic API error (title):", errorText);
      return NextResponse.json({ error: "AI service error" }, { status: response.status });
    }

    const data = await response.json();
    const raw: string = data.content?.[0]?.text ?? "";
    const title = raw
      .trim()
      .replace(/^["'`]+|["'`]+$/g, "")
      .replace(/[\r\n]+/g, " ")
      .slice(0, 80);

    return NextResponse.json({ title });
  } catch (err: unknown) {
    try {
      return apiAuthErrorResponse(err);
    } catch {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Title API error:", message);
      // Log the detail server-side only — never echo internals to the caller.
      return NextResponse.json(
        { error: "Failed to process request" },
        { status: 500 }
      );
    }
  }
}
