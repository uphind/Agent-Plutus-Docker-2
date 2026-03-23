import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient();

const DEMO_USERS = [
  { name: "Alice Chen", dept: "Engineering", team: "Platform", title: "Staff Engineer" },
  { name: "Bob Martinez", dept: "Engineering", team: "Platform", title: "Senior Engineer" },
  { name: "Carol Wu", dept: "Engineering", team: "Frontend", title: "Senior Engineer" },
  { name: "David Kim", dept: "Engineering", team: "Frontend", title: "Engineer" },
  { name: "Eva Singh", dept: "Engineering", team: "Backend", title: "Senior Engineer" },
  { name: "Frank Lopez", dept: "Product", team: "Growth", title: "Product Manager" },
  { name: "Grace Patel", dept: "Product", team: "Growth", title: "Associate PM" },
  { name: "Henry Zhao", dept: "Product", team: "Enterprise", title: "Senior PM" },
  { name: "Irene Costa", dept: "Design", team: "UX Research", title: "Lead Designer" },
  { name: "James Okafor", dept: "Design", team: "UX Research", title: "UX Researcher" },
  { name: "Karen Müller", dept: "Design", team: "Visual", title: "Senior Designer" },
  { name: "Liam Brooks", dept: "Marketing", team: "Content", title: "Content Lead" },
  { name: "Mia Thompson", dept: "Marketing", team: "Content", title: "Content Writer" },
  { name: "Noah Davis", dept: "Sales", team: "Enterprise", title: "Account Executive" },
  { name: "Olivia Wang", dept: "Sales", team: "Enterprise", title: "Sales Engineer" },
];

async function main() {
  const existing = await prisma.organization.findUnique({
    where: { slug: "demo-org" },
  });

  let orgId: string;

  if (existing) {
    orgId = existing.id;
    console.log("Organization already exists:", existing.name);
    console.log("Org ID:", existing.id);
  } else {
    const org = await prisma.organization.create({
      data: {
        name: "Demo Organization",
        slug: "demo-org",
      },
    });

    orgId = org.id;
    console.log("Organization created:", org.name);
    console.log("Org ID:", org.id);
  }

  // Create departments with budgets
  const deptBudgets: Record<string, number> = {
    Engineering: 5000,
    Product: 2000,
    Design: 1500,
    Marketing: 1000,
    Sales: 800,
  };

  const deptMap = new Map<string, string>();
  for (const [name, budget] of Object.entries(deptBudgets)) {
    const dept = await prisma.department.upsert({
      where: { orgId_name: { orgId, name } },
      create: { orgId, name, monthlyBudget: budget, alertThreshold: 80 },
      update: { monthlyBudget: budget },
    });
    deptMap.set(name, dept.id);
  }
  console.log(`Upserted ${deptMap.size} departments with budgets`);

  // Create teams with budgets
  const teamDefs: Array<{ dept: string; name: string; budget: number }> = [
    { dept: "Engineering", name: "Platform", budget: 2000 },
    { dept: "Engineering", name: "Frontend", budget: 1500 },
    { dept: "Engineering", name: "Backend", budget: 1500 },
    { dept: "Product", name: "Growth", budget: 1000 },
    { dept: "Product", name: "Enterprise", budget: 1000 },
    { dept: "Design", name: "UX Research", budget: 800 },
    { dept: "Design", name: "Visual", budget: 700 },
    { dept: "Marketing", name: "Content", budget: 1000 },
    { dept: "Sales", name: "Enterprise", budget: 800 },
  ];

  const teamMap = new Map<string, string>();
  for (const td of teamDefs) {
    const deptId = deptMap.get(td.dept)!;
    const team = await prisma.team.upsert({
      where: { orgId_departmentId_name: { orgId, departmentId: deptId, name: td.name } },
      create: { orgId, departmentId: deptId, name: td.name, monthlyBudget: td.budget, alertThreshold: 80 },
      update: { monthlyBudget: td.budget },
    });
    teamMap.set(`${td.dept}|${td.name}`, team.id);
  }
  console.log(`Upserted ${teamMap.size} teams with budgets`);

  // Create users linked to dept/team entities
  for (let i = 0; i < DEMO_USERS.length; i++) {
    const u = DEMO_USERS[i];
    const email = `${u.name.toLowerCase().replace(/\s+/g, ".").replace(/[^a-z.]/g, "")}@demo-org.com`;
    const departmentId = deptMap.get(u.dept) ?? null;
    const teamId = teamMap.get(`${u.dept}|${u.team}`) ?? null;

    await prisma.orgUser.upsert({
      where: { orgId_email: { orgId, email } },
      update: {
        name: u.name,
        department: u.dept,
        team: u.team,
        departmentId,
        teamId,
        jobTitle: u.title,
        status: "active",
      },
      create: {
        orgId,
        email,
        name: u.name,
        department: u.dept,
        team: u.team,
        departmentId,
        teamId,
        jobTitle: u.title,
        employeeId: `EMP-${String(i + 1).padStart(3, "0")}`,
        status: "active",
      },
    });
  }
  console.log(`Upserted ${DEMO_USERS.length} demo users`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
