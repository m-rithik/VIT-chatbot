import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getVtopSession } from "../../generate/route.js";
import { getAssignmentDetails } from "../../../../lib/vtopUtils.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { classId } = body;

    if (!classId) {
      return NextResponse.json({ error: "Class ID is required" }, { status: 400 });
    }

    // Get VTOP session
    const vtopSession = await getVtopSession(userId);
    
    if (!vtopSession) {
      return NextResponse.json({ 
        error: "No VTOP session found. Please login to VTOP first." 
      }, { status: 401 });
    }

    console.log('=== Fetching Assignment Details via API ===');
    console.log('User ID:', userId);
    console.log('Class ID:', classId);

    // Fetch assignment details
    const details = await getAssignmentDetails(vtopSession, classId);
    
    console.log('✓ Assignment details fetched:', {
      courseInfo: details?.courseInfo?.courseCode,
      assignmentCount: details?.assignments?.length || 0
    });

    return NextResponse.json({
      success: true,
      courseInfo: details?.courseInfo,
      assignments: details?.assignments || [],
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Assignment details API error:", error);
    return NextResponse.json({ 
      error: error.message || "Failed to fetch assignment details" 
    }, { status: 500 });
  }
}

