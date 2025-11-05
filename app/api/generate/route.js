import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import path from "path";
import { 
  detectVtopIntent,
  getAttendance,
  getDigitalAssignments,
  getExamSchedule,
  getFacultySearch,
  formatAttendanceResponse,
  formatAssignmentsResponse,
  formatExamScheduleResponse,
  formatFacultyResponse,
  formatExamScheduleWithAI,
  formatAssignmentsWithAI,
} from "../../../lib/vtopUtils.js";
import {
  detectMessIntent,
  getMessMenu,
  formatMessMenuForChat,
} from "../../../lib/messUtils.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// VTOP Session Storage (shared with login route)
// Using globalThis to ensure it's truly shared across all API routes
if (!globalThis.vtopSessionStore) {
  globalThis.vtopSessionStore = new Map();
  console.log('✓ Initialized global VTOP session store');
}

// Local session storage functions (exactly like CLI)
// Using the already imported fs and path modules

const SESSION_FILE = path.join(process.cwd(), 'vtop-session.json');

const saveSessionToFile = async (userId, sessionData) => {
  try {
    const sessionFile = {
      userId,
      sessionData,
      timestamp: new Date().toISOString()
    };
    await fs.promises.writeFile(SESSION_FILE, JSON.stringify(sessionFile, null, 2), 'utf8');
    console.log(`✓ Session saved to ${SESSION_FILE}`);
  } catch (error) {
    console.warn(`Failed to save session to file: ${error.message}`);
  }
};

const loadSessionFromFile = async () => {
  try {
    const content = await fs.promises.readFile(SESSION_FILE, 'utf8');
    const sessionFile = JSON.parse(content);
    
    // Check if session is not too old (24 hours)
    const sessionAge = Date.now() - new Date(sessionFile.timestamp).getTime();
    if (sessionAge > 24 * 60 * 60 * 1000) {
      console.log('Session file is too old, ignoring');
      return null;
    }
    
    console.log(`✓ Loaded session from ${SESSION_FILE}`);
    return sessionFile;
  } catch (error) {
    console.log(`No session file found or invalid: ${error.message}`);
    return null;
  }
};

const vtopSessions = globalThis.vtopSessionStore;

export async function getVtopSession(userId) {
  // First try memory store
  let session = vtopSessions.get(userId);
  
  if (!session) {
    // Try to load from file (like CLI)
    console.log(`No session in memory, trying to load from file...`);
    const sessionFile = await loadSessionFromFile();
    if (sessionFile && sessionFile.userId === userId) {
      session = sessionFile.sessionData;
      // Restore to memory
      vtopSessions.set(userId, session);
      console.log(`✓ Session restored from file to memory`);
    }
  }
  
  console.log(`getVtopSession(${userId}):`, session ? 'FOUND' : 'NOT FOUND');
  if (session) {
    console.log(`  Session age: ${Date.now() - new Date(session.timestamp).getTime()}ms`);
    console.log(`  Username: ${session.username}`);
    console.log(`  Cookie count: ${session.cookies ? Object.keys(session.cookies).length : 0}`);
  }
  return session;
}

export async function setVtopSession(userId, sessionData) {
  if (sessionData === null || sessionData === undefined) {
    vtopSessions.delete(userId);
    console.log(`deleteVtopSession(${userId}): DELETED`);
  } else {
    vtopSessions.set(userId, sessionData);
    console.log(`setVtopSession(${userId}): STORED`);
    console.log(`  Total sessions: ${vtopSessions.size}`);
    
    // Save to file (like CLI)
    await saveSessionToFile(userId, sessionData);
  }
}

export function deleteVtopSession(userId) {
  vtopSessions.delete(userId);
  console.log(`deleteVtopSession(${userId}): DELETED`);
  
  // Also delete from file
  try {
    fs.unlinkSync(SESSION_FILE);
    console.log(`✓ Session file deleted`);
  } catch (error) {
    // File might not exist, ignore
  }
}

const FACULTY_DATA_PATH = path.join(process.cwd(), "Context", "facultydetails.txt");
const CLUB_CSV_PATH = path.join(process.cwd(), "Context", "vit_clubs.csv");
const CLUB_INFO_PATH = path.join(process.cwd(), "Context", "clubinfo.txt");

const facultyRecords = (() => {
  try {
    const raw = fs.readFileSync(FACULTY_DATA_PATH, "utf8");
    const [, ...lines] = raw.split(/\r?\n/);
    return lines
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, school, position, subject, photoUrl, readMoreUrl] = line.split(" | ").map((part) => part.trim());
        if (!name) return null;
        const normalized = name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
        const tokens = normalized.split(/\s+/).filter(Boolean);
        const filteredTokens = tokens.filter((token) => !["dr", "mr", "mrs", "ms", "prof", "lt", "sir", "madam"].includes(token));
        const displayTokens = filteredTokens.length ? filteredTokens : tokens;
        const displayName = displayTokens.join(' ');
        return {
          name: displayName
            .split(' ')
            .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
            .join(' '),
          school,
          position,
          subject,
          photoUrl,
          readMoreUrl,
          normalized: displayName.toLowerCase(),
          tokens: displayTokens,
          lastToken: displayTokens[displayTokens.length - 1] || '',
          rawName: name,
        };
      })
      .filter(Boolean);
  } catch (error) {
    console.error("Failed to read faculty data", error);
    return [];
  }
})();

function safeLower(str = "") {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const clubRecords = (() => {
  const clubMap = new Map();

  const upsertClub = (name, data) => {
    if (!name) return;
    const key = safeLower(name);
    if (!key) return;
    const existing = clubMap.get(key) || {};
    clubMap.set(key, {
      name: data.name || existing.name || name,
      category: data.category || existing.category || "",
      description: data.description || existing.description || "",
      contactEmail: data.contactEmail || existing.contactEmail || "",
      imageUrl: data.imageUrl || existing.imageUrl || "",
      sourceUrl: data.sourceUrl || existing.sourceUrl || "",
      normalized: key,
      tokens: key.split(/\s+/).filter(Boolean),
    });
  };

  try {
    if (fs.existsSync(CLUB_CSV_PATH)) {
      const csvRaw = fs.readFileSync(CLUB_CSV_PATH, "utf8");
      const [headerLine, ...rows] = csvRaw.split(/\r?\n/).filter(Boolean);
      const headers = headerLine.split(",").map((h) => h.trim());
      rows.forEach((row) => {
        const parts = [];
        let current = "";
        let inQuotes = false;
        for (let i = 0; i < row.length; i += 1) {
          const char = row[i];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === "," && !inQuotes) {
            parts.push(current.trim());
            current = "";
          } else {
            current += char;
          }
        }
        parts.push(current.trim());
        const record = headers.reduce((acc, header, idx) => {
          acc[header] = parts[idx]?.trim?.() ?? "";
          return acc;
        }, {});
        upsertClub(record.club, {
          name: record.club,
          category: record.category,
          description: record.description,
          imageUrl: record.image_url,
          sourceUrl: record.source_url,
        });
      });
    }
  } catch (error) {
    console.error("Failed to parse vit_clubs.csv", error);
  }

  try {
    if (fs.existsSync(CLUB_INFO_PATH)) {
      const infoRaw = fs.readFileSync(CLUB_INFO_PATH, "utf8");
      const [, ...lines] = infoRaw.split(/\r?\n/);
      lines
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line) => {
          const [name, category, description, email, imageUrl, readMoreUrl] = line
            .split(" | ")
            .map((part) => part.trim());
          upsertClub(name, {
            name,
            category,
            description,
            contactEmail: email,
            imageUrl,
            sourceUrl: readMoreUrl,
          });
        });
    }
  } catch (error) {
    console.error("Failed to parse clubinfo.txt", error);
  }

  return Array.from(clubMap.values()).map((club) => ({
    ...club,
    lastToken: club.tokens[club.tokens.length - 1] || "",
  }));
})();

function findFacultyMatches(prompt = "", limit = 3) {
  if (!prompt || !facultyRecords.length) return [];
  const haystack = safeLower(prompt);
  if (!haystack) return [];

  const scored = [];

  for (const record of facultyRecords) {
    let score = 0;

    if (haystack.includes(record.normalized)) {
      score += 30;
    }

    for (const token of record.tokens) {
      if (token.length < 3) continue;
      if (haystack.includes(token)) {
        score += Math.min(token.length, 8);
      }
    }

    if (record.lastToken && haystack.includes(record.lastToken)) {
      score += 5;
    }

    if (score >= 6) {
      scored.push({ score, record });
    }
  }

  if (!scored.length) {
    return [];
  }

  scored.sort((a, b) => b.score - a.score);

  const seen = new Set();
  const matches = [];

  for (const { record, score } of scored) {
    const key = `${record.name.toLowerCase()}|${(record.school || "").toLowerCase()}|${(record.position || "").toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    matches.push({
      name: record.name,
      school: record.school,
      position: record.position,
      subject: record.subject,
      photoUrl: record.photoUrl,
      readMoreUrl: record.readMoreUrl,
      normalized: record.normalized,
      rawName: record.rawName,
      score,
    });
    if (matches.length >= limit) break;
  }

  return matches;
}

function findClubFromPrompt(prompt = "") {
  if (!prompt || !clubRecords.length) return null;
  const haystack = safeLower(prompt);
  if (!haystack) return null;

  let bestMatch = null;

  for (const club of clubRecords) {
    let score = 0;

    if (haystack.includes(club.normalized)) {
      score += 30;
    }

    for (const token of club.tokens) {
      if (token.length < 3) continue;
      if (haystack.includes(token)) {
        score += Math.min(token.length, 6);
      }
    }

    if (club.lastToken && haystack.includes(club.lastToken)) {
      score += 4;
    }

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { score, club };
    }
  }

  if (!bestMatch || bestMatch.score < 6) {
    return null;
  }

  const { club } = bestMatch;
  return {
    name: club.name,
    category: club.category,
    description: club.description,
    contactEmail: club.contactEmail,
    imageUrl: club.imageUrl,
    sourceUrl: club.sourceUrl,
  };
}

// MongoDB removed - logging disabled
async function logInteraction(entry) {
  // No-op: MongoDB removed from project
  // You can implement console logging or file logging here if needed
  console.log('Query logged:', entry.query);
}

const geminiApiKey = process.env.GEMINI_API_KEY?.trim();
// Use gemini-2.5-flash - fast, reliable, and widely available
const GEMINI_MODEL = "gemini-2.5-flash";
const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;

// Log the model being used
if (genAI) {
  console.log(`✓ Gemini AI initialized with model: ${GEMINI_MODEL}`);
  console.log(`  API Key present: ${geminiApiKey ? 'YES' : 'NO'}`);
}

function formatGeminiError(error) {
  const rawMessage = typeof error?.message === "string" && error.message.trim() ? error.message.trim() : String(error);
  const statusCode = typeof error?.status === "number"
    ? error.status
    : error?.status === "INVALID_ARGUMENT"
      ? 400
      : 500;
  const statusText = typeof error?.statusText === "string" && error.statusText.trim() ? error.statusText.trim() : undefined;
  const details = Array.isArray(error?.errorDetails) && error.errorDetails.length ? error.errorDetails : undefined;

  let friendly = rawMessage;

  if (/The string did not match the expected pattern/i.test(rawMessage)) {
    friendly =
      "Gemini rejected the request. Remove any spaces from GEMINI_API_KEY, confirm it has Generative Language access, and verify the model name.";
  } else if (/API key not valid/i.test(rawMessage)) {
    friendly = "The configured GEMINI_API_KEY was rejected by Gemini. Check the key value and any API restrictions.";
  }

  return {
    friendly,
    raw: rawMessage,
    status: statusCode,
    statusText,
    details,
  };
}

export async function POST(req) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!genAI) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not configured" },
      { status: 500 }
    );
  }

  let promptText = "";
  let requestUser = userId;

  try {
    const body = await req.json();
    promptText = typeof body?.prompt === "string" ? body.prompt : "";
    requestUser =
      typeof body?.user === "string" && body.user.trim() ? body.user.trim() : userId;

        // Check for mess menu intent first
        const messIntent = detectMessIntent(promptText);
        if (messIntent) {
          try {
            console.log('=== Mess Menu Query Detected ===');
            console.log('User ID:', userId);
            console.log('Query:', promptText);

            // Default to Men's Hostel Non-Veg (most common)
            const hostelType = 'MH';
            const messType = 'Non-Veg';

            console.log('Fetching today\'s mess menu for:', { hostelType, messType });

            const menuData = await getMessMenu(hostelType, messType);
            
            // Return a simple prompt to trigger the mess menu UI
            const messResponse = "I'll show you today's mess menu. Please select your hostel type and mess type to view the menu.";

            await logInteraction({
              timestamp: new Date(),
              clerkUserId: userId,
              user: requestUser,
              query: promptText,
              response: messResponse,
              source: "mess-menu",
            });

            return NextResponse.json({ text: messResponse });

      } catch (messError) {
        console.error("Mess menu operation failed:", messError);
        
        // Fall back to Gemini for error cases
        console.log("Falling back to Gemini due to mess menu error");
      }
    }

    // Check for VTOP intent
    const vtopIntent = detectVtopIntent(promptText);
    if (vtopIntent) {
      // Check if user has VTOP session - use the exported function for consistency
      const vtopSession = await getVtopSession(userId);
      
      console.log('=== VTOP Query Detected ===');
      console.log('Intent:', vtopIntent);
      console.log('User ID:', userId);
      console.log('Session exists:', vtopSession ? 'YES' : 'NO');
      console.log('All session keys:', Array.from(vtopSessions.keys()));
      console.log('Session store size:', vtopSessions.size);
      
      if (vtopSession) {
        console.log('Session details:', {
          username: vtopSession.username,
          timestamp: vtopSession.timestamp,
          hasCookies: !!vtopSession.cookies,
          hasContext: !!vtopSession.context,
          hasDashboardHtml: !!vtopSession.dashboardHtml,
          cookieCount: vtopSession.cookies ? Object.keys(vtopSession.cookies).length : 0,
          dashboardHtmlLength: vtopSession.dashboardHtml ? vtopSession.dashboardHtml.length : 0
        });
      }
      
      if (!vtopSession) {
        console.log('✗ No VTOP session found for user');
        const response = "To access your VTOP data (attendance, assignments, exams), please login using the VTOP Login panel in the top-left corner.";
        
        await logInteraction({
          timestamp: new Date(),
          clerkUserId: userId,
          user: requestUser,
          query: promptText,
          response,
          source: "vtop-login-required",
        });

        return NextResponse.json({ 
          text: response,
          requiresVtopLogin: true,
        });
      }

      // Validate session has required data
      if (!vtopSession.cookies || !vtopSession.username || !vtopSession.context) {
        console.log('✗ VTOP session missing required data, clearing session');
        console.log('Missing:', {
          cookies: !vtopSession.cookies,
          username: !vtopSession.username,
          context: !vtopSession.context,
          dashboardHtml: !vtopSession.dashboardHtml
        });
        deleteVtopSession(userId);
        const response = "Your VTOP session has expired. Please login again using the VTOP Login panel in the top-left corner.";
        
        await logInteraction({
          timestamp: new Date(),
          clerkUserId: userId,
          user: requestUser,
          query: promptText,
          response,
          source: "vtop-session-expired",
        });

        return NextResponse.json({ 
          text: response,
          requiresVtopLogin: true,
        });
      }
      
      console.log('✓ VTOP session found:', {
        username: vtopSession.username,
        timestamp: vtopSession.timestamp,
        hasCookies: !!vtopSession.cookies,
        hasContext: !!vtopSession.context,
      });

      // Handle VTOP queries based on intent
      try {
        let vtopResponse = "";
        let source = "";

        switch (vtopIntent) {
          case 'attendance':
            const attendanceData = await getAttendance(vtopSession);
            vtopResponse = formatAttendanceResponse(attendanceData);
            source = "vtop-attendance";
            break;

          case 'assignments':
            // Check if assignments are cached
            if (vtopSession.assignments && vtopSession.assignmentsSemester) {
              console.log('✓ Using cached digital assignments');
              const cachedAssignmentsData = {
                assignments: vtopSession.assignments,
                semester: vtopSession.assignmentsSemester
              };
              
              // Use AI to intelligently filter assignments based on query
              vtopResponse = await formatAssignmentsWithAI(cachedAssignmentsData, promptText);
            } else {
              console.log('→ Fetching fresh digital assignments');
              const assignmentsData = await getDigitalAssignments(vtopSession);
              vtopResponse = formatAssignmentsResponse(assignmentsData);
            }
            source = "vtop-assignments";
            break;

          case 'exams':
            // Check if exam schedule is cached
            if (vtopSession.examSchedule && vtopSession.examSemester) {
              console.log('✓ Using cached exam schedule');
              const cachedExamData = {
                schedule: vtopSession.examSchedule,
                semester: vtopSession.examSemester
              };
              
              // Use AI to intelligently filter exams based on query
              vtopResponse = await formatExamScheduleWithAI(cachedExamData, promptText);
            } else {
              console.log('→ Fetching fresh exam schedule');
              const examData = await getExamSchedule(vtopSession);
              vtopResponse = formatExamScheduleResponse(examData);
            }
            source = "vtop-exams";
            break;

          case 'faculty':
            // Extract faculty name from query
            const facultyQuery = promptText.replace(/faculty|professor|teacher|instructor|contact/gi, '').trim();
            if (facultyQuery.length < 3) {
              vtopResponse = "Please provide a faculty name (at least 3 characters) to search.";
            } else {
              const facultyData = await getFacultySearch(vtopSession, facultyQuery);
              vtopResponse = formatFacultyResponse(facultyData.results, facultyQuery);
            }
            source = "vtop-faculty";
            break;

          default:
            vtopResponse = "I detected a VTOP-related query but couldn't determine the specific intent. Please try rephrasing.";
            source = "vtop-unknown";
        }

        await logInteraction({
          timestamp: new Date(),
          clerkUserId: userId,
          user: requestUser,
          query: promptText,
          response: vtopResponse,
          source,
        });

        return NextResponse.json({ text: vtopResponse });

      } catch (vtopError) {
        console.error("VTOP operation failed:", vtopError);
        
        // If VTOP session expired, notify user
        if (vtopError.message.includes('session') || vtopError.message.includes('auth')) {
          vtopSessions.delete(userId);
          return NextResponse.json({ 
            text: "Your VTOP session has expired. Please login again using the VTOP Login panel.",
            requiresVtopLogin: true,
          });
        }

        // Fall back to Gemini for error cases
        console.log("Falling back to Gemini due to VTOP error");
      }
    }

    const facultyMatches = findFacultyMatches(promptText);
    if (facultyMatches.length) {
      const haystack = safeLower(promptText);
      const exactMatch = facultyMatches.find((match) => haystack.includes(match.rawName.toLowerCase()));

      if (exactMatch) {
        const { name, school, position, subject, photoUrl, readMoreUrl } = exactMatch;
        const text = `Here are the details for ${name}:
- School: ${school || "Not listed"}
- Position: ${position || "Not listed"}
- Area: ${subject || "Not listed"}

You can learn more at ${readMoreUrl || "the official VIT faculty page"}.`;

        await logInteraction({
          timestamp: new Date(),
          clerkUserId: userId,
          user: requestUser,
          query: promptText,
          response: text,
          source: "faculty-directory",
          faculties: [exactMatch],
        });

        return NextResponse.json({
          text,
          faculty: exactMatch,
          faculties: [exactMatch],
        });
      }

      const [primaryMatch] = facultyMatches;
      const intro = facultyMatches.length === 1
        ? `Here are the details for ${primaryMatch.name}:`
        : `I found ${facultyMatches.length} people who might match:`;

      const bullets = facultyMatches
        .map((match) => {
          const descriptors = [match.position, match.school].filter(Boolean).join(" · ");
          return descriptors ? `- ${match.name} — ${descriptors}` : `- ${match.name}`;
        })
        .join("\n");

      const detailLine = "Tap a profile below to explore further.";
      const text = [intro, bullets, detailLine].filter(Boolean).join("\n\n");

      await logInteraction({
        timestamp: new Date(),
        clerkUserId: userId,
        user: requestUser,
        query: promptText,
        response: text,
        source: "faculty-directory",
        faculties: facultyMatches,
      });

      return NextResponse.json({
        text,
        faculty: primaryMatch,
        faculties: facultyMatches,
      });
    }

    const clubMatch = findClubFromPrompt(promptText);
    if (clubMatch) {
      const { name, category, description, contactEmail, imageUrl, sourceUrl } = clubMatch;
      const text = `Here's what I found about ${name}:\n- Category: ${category || "Not listed"}\n- Contact: ${contactEmail || "Not listed"}\n\n${description || ""}\n\nCheck out more at ${sourceUrl || "the official VIT club page"}.`;

      await logInteraction({
        timestamp: new Date(),
        clerkUserId: userId,
        user: requestUser,
        query: promptText,
        response: text,
        source: "club-directory",
        club: clubMatch,
      });

      return NextResponse.json({
        text,
        club: clubMatch,
      });
    }

    let text = "No response";
    try {
      console.log(`Generating content with ${GEMINI_MODEL}...`);
      const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
      
      // Use simple string input format
      const result = await model.generateContent(promptText || "Say hello!");
      
      // Try multiple ways to extract the text
      if (result.response?.text) {
        text = result.response.text();
      } else if (result.response?.candidates?.[0]?.content?.parts?.[0]?.text) {
        text = result.response.candidates[0].content.parts[0].text;
      } else if (result.response?.candidates?.[0]?.text) {
        text = result.response.candidates[0].text;
      } else {
        console.warn('Unexpected response format:', JSON.stringify(result.response, null, 2));
        text = "I received your message but couldn't generate a proper response.";
      }
      
      console.log(`✓ Generated response (${text.length} chars)`);
    } catch (modelError) {
      console.error("Gemini model error:", modelError.message);
      console.error("Error details:", modelError);
      
      // Provide a helpful error message
      text = `I'm having trouble connecting to the AI service. Error: ${modelError.message}. Please check your API key configuration.`;
    }

    await logInteraction({
      timestamp: new Date(),
      clerkUserId: userId,
      user: requestUser,
      query: promptText,
      response: text,
      source: "gemini",
    });

    return NextResponse.json({ text });
  } catch (error) {
    const formattedError = formatGeminiError(error);
    console.error("Gemini generateContent error", { raw: formattedError.raw, status: formattedError.status, details: formattedError.details });
    await logInteraction({
      timestamp: new Date(),
      clerkUserId: userId,
      user: requestUser,
      query: promptText,
      response: formattedError.raw,
      source: "error",
    });

    return NextResponse.json({ error: formattedError.friendly }, { status: formattedError.status });
  }
}
