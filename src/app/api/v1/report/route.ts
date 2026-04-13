import { NextRequest, NextResponse } from "next/server";
import { processUsageData, parseCSV } from "@/lib/classifier";
import { generateExcelReport } from "@/lib/classifier/excel-report";

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

    const { rows, summary } = processUsageData(rawData);
    const buffer = await generateExcelReport(rows, summary);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="ai-usage-report-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Report generation failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
