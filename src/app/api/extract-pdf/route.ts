import { NextRequest, NextResponse } from "next/server";
import { apiAuthErrorResponse, requireSuperadmin, verifyApiCaller } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// Reject oversized uploads before reading them into memory. (Netlify also
// caps request bodies around 6 MB in production; this gives a clear error
// instead of a platform-level failure, and protects local/dev too.)
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(request: NextRequest) {
  try {
    // Only the superadmin AskMike admin page uses this route — match the
    // page's own gate (same pattern as companies/delete).
    const { uid: callerUid } = await verifyApiCaller(request);
    await requireSuperadmin(callerUid);

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: "File is too large. Maximum size is 10 MB." },
        { status: 413 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = file.name.toLowerCase();

    let text = "";

    if (fileName.endsWith(".pdf")) {
      // eslint-disable-next-line
      const pdfParse = require("pdf-parse");
      const data = await pdfParse(buffer);
      text = data.text;
    } else if (
      fileName.endsWith(".docx") ||
      fileName.endsWith(".doc")
    ) {
      // eslint-disable-next-line
      const mammoth = require("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else {
      return NextResponse.json(
        { error: "Unsupported file type. Please upload a PDF or Word document." },
        { status: 400 }
      );
    }

    return NextResponse.json({ text });
  } catch (err: unknown) {
    try {
      return apiAuthErrorResponse(err);
    } catch {
      console.error("File text extraction error:", err);
      return NextResponse.json(
        { error: "Failed to extract text from file" },
        { status: 500 }
      );
    }
  }
}
