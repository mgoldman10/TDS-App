import { NextRequest, NextResponse } from "next/server";
import { ANTHROPIC_MODEL, ANTHROPIC_VERSION } from "@/lib/ai-config";

export const dynamic = "force-dynamic";

interface IncomingMessage {
  role: "user" | "assistant";
  content: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages } = body as { messages: IncomingMessage[] };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "Missing messages" }, { status: 400 });
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
    const message = err instanceof Error ? err.message : String(err);
    console.error("Title API error:", message);
    return NextResponse.json(
      { error: "Failed to process request", detail: message },
      { status: 500 }
    );
  }
}
