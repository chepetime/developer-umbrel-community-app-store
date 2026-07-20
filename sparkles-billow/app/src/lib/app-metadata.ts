import "server-only";

import { getPrisma } from "@/lib/prisma";

export function listAppMetadata() {
  return getPrisma().appMetadata.findMany({
    orderBy: { appId: "asc" },
  });
}

export function getAppMetadata(appId = "sparkles-billow") {
  return getPrisma().appMetadata.findUnique({
    where: { appId },
  });
}
