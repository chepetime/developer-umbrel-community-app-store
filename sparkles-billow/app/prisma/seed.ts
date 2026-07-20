import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to seed Billow metadata.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const billowMetadata = {
  appId: "sparkles-billow",
  name: "Billow",
  tagline: "Personal invoices without the spreadsheet drift.",
  version: "0.1.0",
  dockerImage: "sparkles-billow:latest",
  repositoryUrl: "https://github.com/getumbrel/umbrel-community-app-store",
  supportUrl: "https://github.com/getumbrel/umbrel-community-app-store/issues",
};

await prisma.appMetadata.upsert({
  where: { appId: billowMetadata.appId },
  update: billowMetadata,
  create: billowMetadata,
});

await prisma.$disconnect();
