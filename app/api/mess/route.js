import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { 
  getMessOptions, 
  getMessMenu, 
  clearMessCache,
  resetMessitSession,
  formatMessOptionsForChat, 
  formatMessMenuForChat 
} from "../../../lib/messUtils.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET endpoint to fetch mess options (hostel types and mess types)
export async function GET(req) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    console.log("=== Fetching Mess Options via API ===");
    console.log("User ID:", userId);

    const options = await getMessOptions();

    return NextResponse.json({
      success: true,
      ...options,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Mess options API error:", error);
    return NextResponse.json({
      error: error.message || "Failed to fetch mess options"
    }, { status: 500 });
  }
}

// POST endpoint to fetch mess menu for specific hostel and mess type
export async function POST(req) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { hostelType, messType, selectedDate } = body;

    if (!hostelType || !messType) {
      return NextResponse.json({
        error: "Hostel type and mess type are required"
      }, { status: 400 });
    }

    console.log("=== Fetching Mess Menu via API ===");
    console.log("User ID:", userId);
    console.log("Hostel Type:", hostelType);
    console.log("Mess Type:", messType);
    console.log("Selected Date:", selectedDate);

    const menuData = await getMessMenu(hostelType, messType, selectedDate);

    // Transform meals object into menuItems array format for frontend
    const menuItems = [];
    
    const mealTimes = {
      breakfast: '7:00 AM - 9:00 AM',
      lunch: '12:30 PM - 2:30 PM',
      snacks: '4:30 PM - 6:15 PM',
      dinner: '7:00 PM - 9:00 PM'
    };

    if (menuData.meals.breakfast && menuData.meals.breakfast.length > 0) {
      menuItems.push({
        meal: 'Breakfast',
        items: menuData.meals.breakfast,
        time: mealTimes.breakfast
      });
    }
    
    if (menuData.meals.lunch && menuData.meals.lunch.length > 0) {
      menuItems.push({
        meal: 'Lunch',
        items: menuData.meals.lunch,
        time: mealTimes.lunch
      });
    }
    
    if (menuData.meals.snacks && menuData.meals.snacks.length > 0) {
      menuItems.push({
        meal: 'Snacks',
        items: menuData.meals.snacks,
        time: mealTimes.snacks
      });
    }
    
    if (menuData.meals.dinner && menuData.meals.dinner.length > 0) {
      menuItems.push({
        meal: 'Dinner',
        items: menuData.meals.dinner,
        time: mealTimes.dinner
      });
    }

    return NextResponse.json({
      success: true,
      date: menuData.date,
      dayName: menuData.dayName,
      hostelType: menuData.hostelType,
      messType: menuData.messType,
      currentMonth: menuData.currentMonth,
      currentYear: menuData.currentYear,
      selectedDate: menuData.selectedDate,
      availableDates: menuData.availableDates,
      isRealTime: menuData.isRealTime,
      menuItems,  // Frontend expects this format
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Mess menu API error:", error);
    return NextResponse.json({
      error: error.message || "Failed to fetch mess menu"
    }, { status: 500 });
  }
}

// DELETE endpoint to clear mess cache
export async function DELETE(req) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    console.log("=== Resetting Messit Session via API ===");
    console.log("User ID:", userId);

    await resetMessitSession();

    return NextResponse.json({
      success: true,
      message: "Messit session reset successfully",
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Clear cache API error:", error);
    return NextResponse.json({
      error: error.message || "Failed to clear mess cache"
    }, { status: 500 });
  }
}
