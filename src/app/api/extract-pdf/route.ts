import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
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
    console.error("File text extraction error:", err);
    return NextResponse.json(
      { error: "Failed to extract text from file" },
      { status: 500 }
    );
  }
}
