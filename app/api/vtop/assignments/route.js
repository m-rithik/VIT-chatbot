import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getVtopSession } from "../../generate/route.js";
import { getDigitalAssignments } from "../../../../lib/vtopUtils.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get VTOP session
    const vtopSession = await getVtopSession(userId);
    
    if (!vtopSession) {
      return NextResponse.json({ 
        error: "No VTOP session found. Please login to VTOP first." 
      }, { status: 401 });
    }

    console.log('=== Fetching Digital Assignments via API ===');
    console.log('User ID:', userId);
    console.log('Session exists:', !!vtopSession);

    // Fetch digital assignments
    const assignmentsData = await getDigitalAssignments(vtopSession);
    
    console.log('✓ Digital assignments fetched:', {
      totalAssignments: assignmentsData.assignments?.length || 0,
      semester: assignmentsData.semester?.label
    });

    return NextResponse.json({
      success: true,
      assignments: assignmentsData.assignments || [],
      semester: assignmentsData.semester,
      semesters: assignmentsData.semesters || [],
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Digital assignments API error:", error);
    return NextResponse.json({ 
      error: error.message || "Failed to fetch digital assignments" 
    }, { status: 500 });
  }
}

export async function POST(req) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { semesterLabel } = body;

    // Get VTOP session
    const vtopSession = await getVtopSession(userId);
    
    if (!vtopSession) {
      return NextResponse.json({ 
        error: "No VTOP session found. Please login to VTOP first." 
      }, { status: 401 });
    }

    console.log('=== Fetching Digital Assignments for Specific Semester ===');
    console.log('User ID:', userId);
    console.log('Semester Label:', semesterLabel);

    // Fetch digital assignments for specific semester
    const assignmentsData = await getDigitalAssignments(vtopSession, semesterLabel);
    
    console.log('✓ Digital assignments fetched for semester:', {
      totalAssignments: assignmentsData.assignments?.length || 0,
      semester: assignmentsData.semester?.label
    });

    return NextResponse.json({
      success: true,
      assignments: assignmentsData.assignments || [],
      semester: assignmentsData.semester,
      semesters: assignmentsData.semesters || [],
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Digital assignments API error:", error);
    return NextResponse.json({ 
      error: error.message || "Failed to fetch digital assignments" 
    }, { status: 500 });
  }
}
