// Ensures a default Organization row exists.
// Runs at container startup after `prisma migrate deploy`.
// Idempotent — safe to run on every boot.

const { PrismaClient } = require("../src/generated/prisma/client");

async function main() {
  const prisma = new PrismaClient();

  const orgName = process.env.ORG_NAME || "Default Organization";
  const orgSlug = process.env.ORG_SLUG || "default";

  try {
    const existing = await prisma.organization.findFirst();

    if (existing) {
      console.log(`[seed] Organization already exists: ${existing.name} (${existing.slug})`);
      return;
    }

    const org = await prisma.organization.create({
      data: {
        name: orgName,
        slug: orgSlug,
      },
    });

    console.log(`[seed] Created Organization: ${org.name} (id: ${org.id})`);
  } catch (err) {
    console.error("[seed] Failed to seed organization:", err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
