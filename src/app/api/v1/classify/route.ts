import { NextRequest, NextResponse } from "next/server";
import { processUsageData, parseCSV } from "@/lib/classifier";

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    let rawData: unknown;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      if (!file || !(file instanceof File)) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
      }

      const text = await file.text();
      const name = file.name.toLowerCase();

      if (name.endsWith(".csv")) {
        rawData = parseCSV(text);
      } else {
        rawData = JSON.parse(text);
      }
    } else {
      rawData = await request.json();
    }

    const result = processUsageData(rawData);

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Classification failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
