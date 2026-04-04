import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { coachId, messages, context } = body;

    if (!coachId || !messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Fetch coach config fresh from Firestore
    const coachSnap = await getAdminDb()
      .collection("config")
      .doc("askmike")
      .collection("coaches")
      .doc(coachId)
      .get();

    if (!coachSnap.exists) {
      return NextResponse.json({ error: "Coach not found" }, { status: 404 });
    }

    const coach = coachSnap.data();
    if (!coach) {
      return NextResponse.json({ error: "Coach data empty" }, { status: 404 });
    }

    // Fetch reference documents if coach has any
    let refDocTexts: string[] = [];
    if (coach.referenceDocIds?.length > 0) {
      const refDocSnaps = await Promise.all(
        coach.referenceDocIds.map((id: string) =>
          getAdminDb().collection("config").doc("askmike").collection("refdocs").doc(id).get()
        )
      );
      refDocTexts = refDocSnaps
        .filter((s) => s.exists)
        .map((s) => {
          const d = s.data();
          return `[${d?.title ?? "Document"}]\n${d?.textContent ?? ""}`;
        });
    }

    // Build system prompt
    let systemPrompt = coach.systemPrompt || "";
    if (refDocTexts.length > 0) {
      systemPrompt += "\n\nReference Documents:\n" + refDocTexts.join("\n\n---\n\n");
    }
    if (context) {
      systemPrompt += "\n\nCurrent Context:\n" + context;
    }

    // Call Anthropic API
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API key not configured" }, { status: 500 });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        system: systemPrompt,
        messages: messages.map((m: { role: string; content: string }) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("Anthropic API error:", errorData);
      return NextResponse.json(
        { error: "AI service error" },
        { status: response.status }
      );
    }

    const data = await response.json();
    const assistantMessage = data.content?.[0]?.text ?? "I couldn't generate a response.";

    return NextResponse.json({ message: assistantMessage });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("AskMike API error:", message);
    return NextResponse.json(
      { error: "Failed to process request", detail: message },
      { status: 500 }
    );
  }
}
