import "server-only";

import { getPrisma } from "@/lib/prisma";

export async function listAppMetadata() {
  try {
    return await getPrisma().appMetadata.findMany({
      orderBy: { appId: "asc" },
    });
  } catch (error) {
    console.error("Failed to list app metadata", error);
    return [];
  }
}

export async function getAppMetadata(appId = "sparkles-billow") {
  try {
    return await getPrisma().appMetadata.findUnique({
      where: { appId },
    });
  } catch (error) {
    console.error("Failed to load app metadata", error);
    return null;
  }
}
