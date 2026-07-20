import { NextResponse } from "next/server";

import { listAppMetadata } from "@/lib/app-metadata";

export const dynamic = "force-dynamic";

export async function GET() {
  const metadata = await listAppMetadata();

  return NextResponse.json({
    metadata,
    databaseAvailable: metadata.length > 0,
  });
}
