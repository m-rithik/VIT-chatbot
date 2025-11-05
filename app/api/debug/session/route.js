import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getVtopSession } from "../../generate/route.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const session = await getVtopSession(userId);
  
  return NextResponse.json({
    userId,
    hasSession: !!session,
    sessionData: session ? {
      username: session.username,
      timestamp: session.timestamp,
      hasCookies: !!session.cookies,
      hasContext: !!session.context,
    } : null,
    debug: {
      sessionStoreSize: globalThis.vtopSessionStore?.size || 0,
      sessionStoreKeys: globalThis.vtopSessionStore ? Array.from(globalThis.vtopSessionStore.keys()) : [],
    }
  });
}
