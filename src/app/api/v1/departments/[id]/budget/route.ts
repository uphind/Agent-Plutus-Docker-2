import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";

const budgetSchema = z.object({
  monthly_budget: z.number().min(0).nullable(),
  alert_threshold: z.number().int().min(1).max(200).optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const orgId = await getOrgId();
  const { id } = await params;

  const dept = await prisma.department.findUnique({ where: { id } });
  if (!dept || dept.orgId !== orgId) {
    return NextResponse.json({ error: "Department not found" }, { status: 404 });
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = budgetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const updated = await prisma.department.update({
    where: { id },
    data: {
      monthlyBudget: parsed.data.monthly_budget,
      alertThreshold: parsed.data.alert_threshold ?? dept.alertThreshold,
    },
  });

  return NextResponse.json({
    success: true,
    department: {
      id: updated.id,
      name: updated.name,
      monthlyBudget: updated.monthlyBudget ? Number(updated.monthlyBudget) : null,
      alertThreshold: updated.alertThreshold,
    },
  });
}
