import "server-only";

import { prisma } from "@/lib/prisma";

export function listAppMetadata() {
  return prisma.appMetadata.findMany({
    orderBy: { appId: "asc" },
  });
}

export function getAppMetadata(appId = "sparkles-billow") {
  return prisma.appMetadata.findUnique({
    where: { appId },
  });
}
