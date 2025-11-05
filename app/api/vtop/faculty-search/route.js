import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getVtopSession } from "../../generate/route.js";
import { getFacultySearch } from "../../../../lib/vtopUtils.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { searchQuery } = body;

    if (!searchQuery || searchQuery.trim().length < 3) {
      return NextResponse.json({
        error: "Search query must be at least 3 characters long"
      }, { status: 400 });
    }

    console.log("=== Fetching Faculty Search via API ===");
    console.log("User ID:", userId);
    console.log("Search Query:", searchQuery);

    const vtopSession = await getVtopSession(userId);

    if (!vtopSession) {
      return NextResponse.json({
        error: "No VTOP session found. Please login to VTOP first."
      }, { status: 401 });
    }

    console.log("Session exists:", !!vtopSession);

    const facultyData = await getFacultySearch(vtopSession, searchQuery.trim());

    return NextResponse.json({
      success: true,
      ...facultyData,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Faculty search API error:", error);
    return NextResponse.json({
      error: error.message || "Failed to search faculty"
    }, { status: 500 });
  }
}

