-- AlterEnum: restore first-class providers for Discovery + sync scaffolding.
ALTER TYPE "Provider" ADD VALUE 'microsoft_copilot';
ALTER TYPE "Provider" ADD VALUE 'lovable';
ALTER TYPE "Provider" ADD VALUE 'n8n';
