import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getVtopSession } from "../../generate/route.js";
import { getFacultyDetails } from "../../../../lib/vtopUtils.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { employeeId } = body;

    if (!employeeId) {
      return NextResponse.json({
        error: "Employee ID is required"
      }, { status: 400 });
    }

    console.log("=== Fetching Faculty Details via API ===");
    console.log("User ID:", userId);
    console.log("Employee ID:", employeeId);

    const vtopSession = await getVtopSession(userId);

    if (!vtopSession) {
      return NextResponse.json({
        error: "No VTOP session found. Please login to VTOP first."
      }, { status: 401 });
    }

    console.log("Session exists:", !!vtopSession);

    const facultyDetails = await getFacultyDetails(vtopSession, employeeId);

    return NextResponse.json({
      success: true,
      ...facultyDetails,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Faculty details API error:", error);
    return NextResponse.json({
      error: error.message || "Failed to fetch faculty details"
    }, { status: 500 });
  }
}

