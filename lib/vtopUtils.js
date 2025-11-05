// VTOP Utility Functions for Chatbot Integration
// Adapted from VTOP-CLI

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'https://vtop.vit.ac.in';
const APP_BASE_URL = `${BASE_URL}/vtop/`;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Captcha solver initialization
let solveCaptchaFromBase64 = null;

// Initialize captcha solver
const initializeCaptchaSolver = async () => {
  if (solveCaptchaFromBase64) return solveCaptchaFromBase64;
  
  try {
    const captchaPath = path.join(__dirname, 'captcha', 'nodeSolver.js');
    const nodeSolver = await import(captchaPath);
    solveCaptchaFromBase64 = nodeSolver.solveCaptchaFromBase64;
    console.log('✓ Captcha solver initialized in vtopUtils');
    return solveCaptchaFromBase64;
  } catch (error) {
    console.warn('⚠ Captcha solver not available in vtopUtils:', error.message);
    return null;
  }
};

const stripTags = (value) => {
  if (!value) return '';
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
};

const fetchWithTimeout = async (url, options = {}, timeoutMs = 30000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
};

const cookieHeader = (cookieObj) =>
  Object.entries(cookieObj)
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');

const fetchWithCookies = async (url, cookies, options = {}, timeoutMs = 30000) => {
  const headers = new Headers(options.headers || {});
  headers.set('User-Agent', USER_AGENT);
  if (!headers.has('Accept')) {
    headers.set('Accept', 'text/html,application/xhtml+xml,application/json');
  }
  
  // Handle both string cookies and cookie objects (like CLI)
  if (cookies) {
    if (typeof cookies === 'string') {
      headers.set('Cookie', cookies);
    } else {
      headers.set('Cookie', cookieHeader(cookies));
    }
  }
  
  return await fetchWithTimeout(url, { ...options, headers }, timeoutMs);
};

// Captcha extraction function (from vtop-login.js)
const extractCaptcha = (html) => {
  // Try pattern 1: id="captchaImage"
  const byId = /<img[^>]+id=["']captchaImage["'][^>]+src=["']\s*(data:image\/[^;]+;base64,[^"']+)["']/i;
  const idMatch = html.match(byId);
  if (idMatch && idMatch[1] && !idMatch[1].includes('null')) {
    console.log('Captcha found by id="captchaImage"');
    return idMatch[1];
  }
  
  // Try pattern 2: src first, then id
  const byId2 = /<img[^>]+src=["']\s*(data:image\/[^;]+;base64,[^"']+)["'][^>]*id=["']captchaImage["']/i;
  const idMatch2 = html.match(byId2);
  if (idMatch2 && idMatch2[1] && !idMatch2[1].includes('null')) {
    console.log('Captcha found by src then id');
    return idMatch2[1];
  }
  
  // Try pattern 3: alt="vtopCaptcha"
  const byAlt = /<img[^>]+alt=["']vtopCaptcha["'][^>]+src=["']\s*(data:image\/[^;]+;base64,[^"']+)["']/i;
  const altMatch = html.match(byAlt);
  if (altMatch && altMatch[1] && !altMatch[1].includes('null')) {
    console.log('Captcha found by alt="vtopCaptcha"');
    return altMatch[1];
  }
  
  // Try pattern 4: src first, then alt
  const byAlt2 = /<img[^>]+src=["']\s*(data:image\/[^;]+;base64,[^"']+)["'][^>]*alt=["']vtopCaptcha["']/i;
  const altMatch2 = html.match(byAlt2);
  if (altMatch2 && altMatch2[1] && !altMatch2[1].includes('null')) {
    console.log('Captcha found by src then alt');
    return altMatch2[1];
  }
  
  // Try pattern 5: Any img with base64 data (generic fallback)
  const genericPattern = /<img[^>]+src=["']\s*(data:image\/[^;]+;base64,[A-Za-z0-9+/=]{100,})["']/gi;
  const matches = html.matchAll(genericPattern);
  for (const match of matches) {
    if (match[1] && !match[1].includes('null')) {
      console.log('Captcha found by generic base64 pattern');
      return match[1];
    }
  }
  
  console.warn('No valid captcha image found in HTML');
  return null;
};

// Solve captcha function
const solveCaptcha = async (captchaSrc) => {
  if (!captchaSrc) return '';
  
  const solver = await initializeCaptchaSolver();
  if (!solver) {
    console.warn('Captcha solver not available, cannot solve captcha');
    return '';
  }
  
  try {
    const solvedCaptcha = await solver(captchaSrc);
    console.log(`✓ Captcha solved: ${solvedCaptcha}`);
    return solvedCaptcha;
  } catch (error) {
    console.warn(`✗ Captcha solver failed: ${error.message}`);
    return '';
  }
};

// Enhanced fetch function that can handle captcha-protected requests
const fetchWithCaptchaHandling = async (url, cookies, options = {}, timeoutMs = 30000) => {
  const response = await fetchWithCookies(url, cookies, options, timeoutMs);
  
  // Check if the response contains a captcha
  const html = await response.text();
  const captchaSrc = extractCaptcha(html);
  
  if (captchaSrc && options.method === 'POST') {
    console.log('🔄 Captcha detected in response, attempting to solve...');
    
    // Try to solve the captcha
    const solvedCaptcha = await solveCaptcha(captchaSrc);
    
    if (solvedCaptcha) {
      console.log('🔄 Retrying request with solved captcha...');
      
      // Extract CSRF token from the response
      const csrfMatch = html.match(/name="_csrf"[^>]*value="([^"]+)"/i);
      const csrf = csrfMatch ? csrfMatch[1] : '';
      
      // Retry the request with the solved captcha
      const retryOptions = {
        ...options,
        body: options.body ? 
          `${options.body}&captchaStr=${encodeURIComponent(solvedCaptcha)}&_csrf=${encodeURIComponent(csrf)}` :
          `captchaStr=${encodeURIComponent(solvedCaptcha)}&_csrf=${encodeURIComponent(csrf)}`
      };
      
      return await fetchWithCookies(url, cookies, retryOptions, timeoutMs);
    } else {
      console.warn('⚠ Could not solve captcha, returning original response');
    }
  }
  
  // Return a new response object with the HTML content
  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
};

// Attendance Parser - Using CLI method
export async function getAttendance(sessionData) {
  if (!sessionData || !sessionData.cookies || !sessionData.context) {
    throw new Error('Invalid session data');
  }

  const { cookies, context } = sessionData;
  
  console.log('=== Fetching Attendance Data ===');
  console.log('Context:', {
    authorizedId: context.authorizedId,
    csrfName: context.csrfName,
    hasCsrfValue: !!context.csrfValue
  });

  // First try to parse from dashboard HTML (like CLI does)
  let attendance = [];
  if (sessionData.dashboardHtml) {
    console.log('Parsing attendance from cached dashboard HTML...');
    attendance = parseAttendanceFromDashboard(sessionData.dashboardHtml);
    console.log(`Found ${attendance.length} courses in dashboard HTML`);
  }

  // If no attendance found, fetch from server (like CLI does)
  if (attendance.length === 0) {
    console.log('No attendance in cached dashboard, fetching fresh data from server...');
    const url = `${APP_BASE_URL}get/dashboard/current/semester/course/details`;
    
    const params = new URLSearchParams();
    params.append('authorizedID', context.authorizedId);
    params.append(context.csrfName || '_csrf', context.csrfValue);
    params.append('x', new Date().toUTCString());

    // Add delay like CLI does
    await delay(1000);

    const response = await fetchWithCaptchaHandling(url, cookies, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch attendance data: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    console.log('Attendance data received, parsing...');
    attendance = parseAttendanceFromDashboard(html);
  }

  console.log(`Final attendance data: ${attendance.length} courses`);
  return attendance;
}

// CLI-style attendance parsing (exact copy from CLI)
const parseTableRows = (tableHtml) => {
  const courses = [];
  
  // Extract all table rows
  const rowRegex = /<tr[^>]*class=["'][^"']*text-center[^"']*["'][^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  
  while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
    const rowHtml = rowMatch[1];
    
    // Skip header row
    if (rowHtml.includes('<th') && rowHtml.includes('Code - Course Name')) {
      continue;
    }
    
    // Extract cells from this row
    const cells = [];
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cellMatch;
    
    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      cells.push(cellMatch[1]);
    }
    
    if (cells.length >= 4) {
      // Extract course code and name
      const courseCell = cells[0];
      
      // Match the course code (has fw-bold class)
      const codeMatch = courseCell.match(/<span[^>]*class=["'][^"']*fw-bold[^"']*["'][^>]*>([^<]+)<\/span>/);
      const courseCode = codeMatch ? stripTags(codeMatch[1]) : '';
      
      // Match the course name (second span with text-dark but NOT fw-bold)
      const allSpans = courseCell.match(/<span[^>]*class=["'][^"']*text-dark[^"']*["'][^>]*>([^<]+)<\/span>/g);
      let courseName = '';
      if (allSpans && allSpans.length >= 2) {
        const nameMatch = allSpans[1].match(/>([^<]+)<\/span>/);
        courseName = nameMatch ? stripTags(nameMatch[1]) : '';
      } else if (allSpans && allSpans.length === 1 && !allSpans[0].includes('fw-bold')) {
        const nameMatch = allSpans[0].match(/>([^<]+)<\/span>/);
        courseName = nameMatch ? stripTags(nameMatch[1]) : '';
      }
      
      // Extract course type
      const typeCell = cells[1];
      const courseType = stripTags(typeCell);
      
      // Extract attendance percentage
      const attendanceCell = cells[2];
      const attendanceMatch = attendanceCell.match(/<span[^>]*>([\d.]+)<\/span>/);
      const attendance = attendanceMatch ? attendanceMatch[1] : '0';
      
      // Determine attendance color/status
      let attendanceStatus = 'good';
      if (attendanceCell.includes('text-success')) {
        attendanceStatus = 'excellent';
      } else if (attendanceCell.includes('text-warning')) {
        attendanceStatus = 'warning';
      } else if (attendanceCell.includes('text-danger')) {
        attendanceStatus = 'danger';
      }
      
      // Extract remarks
      const remarksCell = cells[3];
      const remarks = stripTags(remarksCell);
      
      if (courseCode && courseName) {
        courses.push({
          courseCode,
          courseName,
          courseType,
          attendance: parseFloat(attendance),
          attendanceStatus,
          remarks,
        });
      }
    }
  }
  
  return courses;
};

const parseAttendanceFromDashboard = (html) => {
  if (!html) {
    console.warn('parseAttendanceFromDashboard: No HTML provided');
    return [];
  }
  
  // Find the attendance table in the dashboard
  const tableMatch = html.match(
    /<div[^>]*class=["'][^"']*courseData[^"']*["'][^>]*>([\s\S]*?)<\/table>/i
  );
  
  if (!tableMatch) {
    console.warn('Could not find courseData table in dashboard HTML');
    // Try alternative pattern - search for the table directly
    const altMatch = html.match(
      /<table[^>]*class=["'][^"']*table[^"']*["'][^>]*>[\s\S]*?<thead>[\s\S]*?Code - Course Name[\s\S]*?<\/thead>[\s\S]*?<tbody>([\s\S]*?)<\/tbody>[\s\S]*?<\/table>/i
    );
    if (!altMatch) {
      console.warn('Alternative table pattern also not found');
      return [];
    }
    // Use the full table match
    const fullTableMatch = html.match(
      /<table[^>]*class=["'][^"']*table[^"']*["'][^>]*>[\s\S]*?<thead>[\s\S]*?Code - Course Name[\s\S]*?<\/table>/i
    );
    if (fullTableMatch) {
      const courses = parseTableRows(fullTableMatch[0]);
      console.log(`Parsed ${courses.length} courses using alternative pattern`);
      return courses;
    }
    return [];
  }
  
  const tableHtml = tableMatch[0];
  const courses = parseTableRows(tableHtml);
  console.log(`Parsed ${courses.length} courses from courseData div`);
  return courses;
};

// Digital Assignments Parser - Using CLI method
export async function getDigitalAssignments(sessionData, semesterLabel = null) {
  if (!sessionData || !sessionData.cookies || !sessionData.context) {
    throw new Error('Invalid session data');
  }

  const { cookies, context } = sessionData;
  
  console.log('=== Fetching Digital Assignments ===');
  console.log('Context:', {
    authorizedId: context.authorizedId,
    csrfName: context.csrfName,
    hasCsrfValue: !!context.csrfValue
  });

  // Step 1: Fetch initial Digital Assignment page (exactly like CLI)
  const initialUrl = `${APP_BASE_URL}examinations/StudentDA`;
  
  // Add delay like CLI does
  await delay(1000);
  
  // Build parameters exactly like CLI
  const params = new URLSearchParams();
  params.append('authorizedID', context.authorizedId);
  params.append(context.csrfName || '_csrf', context.csrfValue);
  params.append('verifyMenu', 'true');
  params.append('x', new Date().toUTCString());
  
  console.log(`    ↳ POST ${initialUrl}`);
  const initialResponse = await fetchWithCaptchaHandling(initialUrl, cookies, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: params.toString(),
  });

  if (!initialResponse.ok) {
    throw new Error(`Failed to fetch Digital Assignment page: ${initialResponse.status} ${initialResponse.statusText}`);
  }

  const initialHtml = await initialResponse.text();
  console.log('Initial DA page fetched, parsing semesters...');
  
  // Step 2: Parse available semesters (using CLI's exact logic)
  const semesters = parseDASemesterOptions(initialHtml);
  
  if (semesters.length === 0) {
    console.log('No semester options found in Digital Assignment page');
    return { assignments: [], semester: null, semesters: [], error: 'No semesters available' };
  }
  
  console.log(`Found ${semesters.length} available semesters`);
  
  // Step 3: Select semester (like CLI does)
  let selectedSemester = null;
  
  if (semesterLabel) {
    // Try to find matching semester
    selectedSemester = findDASemesterOption(initialHtml, semesterLabel);
  }
  
  if (!selectedSemester) {
    // Default to Fall Semester 2025-26 (current semester)
    const fallSemester = semesters.find(sem => 
      sem.label.toLowerCase().includes('fall semester 2025-26')
    );
    
    if (fallSemester) {
      selectedSemester = fallSemester;
      console.log(`Using default semester: ${selectedSemester.label}`);
    } else {
      // Fallback to first available semester
      selectedSemester = findDASemesterOption(initialHtml);
    }
  }
  
  if (!selectedSemester || !selectedSemester.value) {
    console.log('No semester selected, using first available');
    selectedSemester = semesters[0];
  }
  
  console.log(`Selected semester: ${selectedSemester.label}`);

  // Step 4: Fetch assignments for selected semester (like CLI does)
  let assignmentsHtml = initialHtml;
  let assignmentsFound = false;
  
  try {
    assignmentsHtml = await fetchDigitalAssignmentForSemester(
      cookies,
      context,
      selectedSemester.value
    );
    console.log('Semester-specific assignments fetched');
    assignmentsFound = true;
  } catch (error) {
    console.warn(`Failed to fetch DA for semester ${selectedSemester.label}: ${error.message}`);
    
    // Try alternative semesters if the first one fails
    const alternativeSemesters = semesters.filter(sem => 
      sem.value !== selectedSemester.value && 
      !sem.label.toLowerCase().includes('2025-26')
    );
    
    for (const altSemester of alternativeSemesters.slice(0, 3)) { // Try up to 3 alternative semesters
      try {
        console.log(`Trying alternative semester: ${altSemester.label}`);
        assignmentsHtml = await fetchDigitalAssignmentForSemester(
          cookies,
          context,
          altSemester.value
        );
        selectedSemester = altSemester; // Update selected semester
        console.log(`✓ Found assignments in ${altSemester.label}`);
        assignmentsFound = true;
        break;
      } catch (altError) {
        console.warn(`Failed to fetch DA for alternative semester ${altSemester.label}: ${altError.message}`);
      }
    }
    
    if (!assignmentsFound) {
      console.log('Using initial page data as fallback');
    }
  }

  // Step 5: Parse assignments (using CLI's exact logic)
  const assignments = parseAssignments(assignmentsHtml);
  
  console.log(`Parsed ${assignments.length} assignments`);
  
  
  return {
    assignments,
    semester: selectedSemester,
    semesters
  };
}

// CLI Helper Functions for Digital Assignments
function parseDASemesterOptions(html) {
  if (!html) return [];
  const selectMatch = html.match(
    /<select[^>]+id=["']semesterSubId["'][^>]*>([\s\S]*?)<\/select>/i,
  );
  if (!selectMatch) return [];
  
  const options = [];
  const optionRegex = /<option[^>]*value=["']([^"']+)["'][^>]*>([\s\S]*?)<\/option>/gi;
  let match;
  
  while ((match = optionRegex.exec(selectMatch[1])) !== null) {
    const value = match[1].trim();
    const label = stripTags(match[2]).trim();
    if (value && label && !label.toLowerCase().includes('select')) {
      options.push({ value, label });
    }
  }
  
  return options;
}

function findDASemesterOption(html, label) {
  if (!html) return null;
  const selectMatch = html.match(
    /<select[^>]+id=["']semesterSubId["'][^>]*>([\s\S]*?)<\/select>/i,
  );
  if (!selectMatch) return null;
  
  const options = [];
  const optionRegex = /<option[^>]*value=["']([^"']+)["'][^>]*(?:selected)?[^>]*>([\s\S]*?)<\/option>/gi;
  let match;
  
  while ((match = optionRegex.exec(selectMatch[1])) !== null) {
    const value = match[1].trim();
    const label = stripTags(match[2]).trim();
    const isSelected = match[0].includes('selected');
    
    if (value && label && !label.toLowerCase().includes('select')) {
      options.push({ value, label, selected: isSelected });
    }
  }
  
  // If specific label requested, find it
  if (label) {
    const found = options.find(opt => 
      opt.label.toLowerCase().includes(label.toLowerCase())
    );
    if (found) return found;
  }
  
  // Find selected option
  const selected = options.find(opt => opt.selected);
  if (selected) return selected;
  
  // Return first option
  return options[0] || null;
}

async function fetchDigitalAssignmentForSemester(cookies, context, semesterValue) {
  const url = `${APP_BASE_URL}examinations/doDigitalAssignment`;
  
  // Build multipart/form-data boundary and body (exactly like CLI does)
  const boundary = `----WebKitFormBoundary${Math.random().toString(36).substring(2)}`;
  const parts = [];
  
  parts.push(`--${boundary}\r\n`);
  parts.push(`Content-Disposition: form-data; name="authorizedID"\r\n\r\n`);
  parts.push(`${context.authorizedId}\r\n`);
  
  parts.push(`--${boundary}\r\n`);
  parts.push(`Content-Disposition: form-data; name="x"\r\n\r\n`);
  parts.push(`${new Date().toUTCString()}\r\n`);
  
  parts.push(`--${boundary}\r\n`);
  parts.push(`Content-Disposition: form-data; name="semesterSubId"\r\n\r\n`);
  parts.push(`${semesterValue}\r\n`);
  
  // Add CSRF token (this was missing!)
  parts.push(`--${boundary}\r\n`);
  parts.push(`Content-Disposition: form-data; name="${context.csrfName || '_csrf'}"\r\n\r\n`);
  parts.push(`${context.csrfValue}\r\n`);
  
  parts.push(`--${boundary}--\r\n`);
  
  const body = parts.join('');

  await delay(500); // CLI delay

  console.log(`    ↳ POST ${url} (semester: ${semesterValue})`);
  const response = await fetchWithCaptchaHandling(url, cookies, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'X-Requested-With': 'XMLHttpRequest', // This was also missing!
    },
    body: body,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch DA for semester: ${response.status} ${response.statusText}`);
  }

  return await response.text();
}

// Fetch detailed assignment information for a specific course (like CLI does)
async function fetchAssignmentDetails(cookies, context, classId) {
  const url = `${APP_BASE_URL}examinations/processDigitalAssignment`;
  
  const params = new URLSearchParams();
  params.append('authorizedID', context.authorizedId);
  params.append(context.csrfName || '_csrf', context.csrfValue);
  params.append('classId', classId);
  params.append('x', new Date().toUTCString());

  await delay(500);

  console.log(`    ↳ POST ${url} (classId: ${classId})`);
  const response = await fetchWithCaptchaHandling(url, cookies, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch assignment details: ${response.status} ${response.statusText}`);
  }

  return await response.text();
}

// Parse detailed assignment information (like CLI does)
function parseAssignmentDetails(html) {
  if (!html) return null;
  
  const result = {
    courseInfo: null,
    assignments: [],
  };
  
  // Parse course info table (first table)
  const courseTableMatch = html.match(
    /<table[^>]*class=["']customTable["'][^>]*>[\s\S]*?<tr[^>]*class=["'][^"']*tableContent[^"']*["'][^>]*>([\s\S]*?)<\/tr>[\s\S]*?<\/table>/i
  );
  
  if (courseTableMatch) {
    const cells = [];
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let match;
    while ((match = cellRegex.exec(courseTableMatch[1])) !== null) {
      cells.push(stripTags(match[1]));
    }
    if (cells.length >= 5) {
      result.courseInfo = {
        semester: cells[0],
        courseCode: cells[1],
        courseTitle: cells[2],
        courseType: cells[3],
        classNumber: cells[4],
      };
    }
  }
  
  // Parse assignment details table (second table with rowspan)
  const assignTableMatch = html.match(
    /<table[^>]*class=["']customTable["'][^>]*>[\s\S]*?<tr[^>]*class=["'][^"']*tableHeader[^"']*["'][^>]*>[\s\S]*?<td[^>]*colspan=["']3["'][^>]*>Document Details<\/td>[\s\S]*?<\/tr>([\s\S]*?)<\/table>/i
  );
  
  if (assignTableMatch) {
    const rowRegex = /<tr[^>]*class=["'][^"']*tableContent[^"']*["'][^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    while ((rowMatch = rowRegex.exec(assignTableMatch[1])) !== null) {
      const rowHtml = rowMatch[1];
      const cells = [];
      const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      let cellMatch;
      while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
        cells.push(cellMatch[1]);
      }
      
      if (cells.length >= 9) {
        const dueDateMatch = cells[4].match(/<span[^>]*style=["'][^"']*color:\s*(\w+)[^"']*["'][^>]*>([^<]+)<\/span>/i);
        const dueDate = dueDateMatch ? dueDateMatch[2].trim() : stripTags(cells[4]);
        const dueDateColor = dueDateMatch ? dueDateMatch[1] : 'unknown';
        
        const lastUpdated = stripTags(cells[6]);
        const hasUpload = cells[7].includes('bi-pencil-fill') || cells[7].includes('editAssignment');
        const hasDownload = !cells[8].includes('text-danger') && cells[8].includes('href');
        
        // Extract code from hidden input
        const codeMatch = cells[7].match(/name=["']code["'][^>]*value=["']([^"']+)["']/i);
        const code = codeMatch ? codeMatch[1] : null;
        
        result.assignments.push({
          slNo: stripTags(cells[0]),
          title: stripTags(cells[1]),
          maxMark: stripTags(cells[2]),
          weightage: stripTags(cells[3]),
          dueDate,
          dueDateColor,
          hasQP: cells[5].trim().length > 10,
          lastUpdated: lastUpdated || 'Not uploaded',
          canUpload: hasUpload,
          canDownload: hasDownload,
          code,
        });
      }
    }
  }
  
  return result;
}

function parseAssignments(html) {
  if (!html) return [];
  
  // Use CLI's exact parsing logic
  const containerMatch = html.match(
    /<div[^>]+id=["']fixedTableContainer["'][^>]*>([\s\S]*?)<\/table>/i,
  );
  const targetHtml = containerMatch ? containerMatch[0] : html;
  
  const rowRegex = /<tr[^>]*class=["']tableContent["'][^>]*>([\s\S]*?)<\/tr>/gi;
  const assignments = [];
  let rowMatch;
  
  while ((rowMatch = rowRegex.exec(targetHtml)) !== null) {
    const rowHtml = rowMatch[1];
    const cells = [];
    const rawCells = [];
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cellMatch;
    
    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      rawCells.push(cellMatch[1]);
      cells.push(stripTags(cellMatch[1]));
    }
    
    if (cells.length >= 7) {
      // Try multiple patterns for dashboardRef extraction
      let dashboardRef = null;
      
      // Pattern 1: myFunction('classId')
      const myFunctionMatch = rowHtml.match(/myFunction\(['"]([^'"]+)['"]\)/i);
      if (myFunctionMatch) {
        dashboardRef = myFunctionMatch[1];
      }
      
      // Pattern 2: onclick="someFunction('classId')"
      if (!dashboardRef) {
        const onclickMatch = rowHtml.match(/onclick=["']([^"']*\(['"]([^'"]+)['"]\)[^"']*)["']/i);
        if (onclickMatch && onclickMatch[2]) {
          dashboardRef = onclickMatch[2];
        }
      }
      
      // Pattern 3: data-classid or similar attributes
      if (!dashboardRef) {
        const dataMatch = rowHtml.match(/data-[^=]*=["']([^"']+)["']/i);
        if (dataMatch) {
          dashboardRef = dataMatch[1];
        }
      }
      
      // Pattern 4: Look for class ID pattern (VL followed by numbers)
      if (!dashboardRef) {
        const classIdMatch = rowHtml.match(/['"](VL\d+)['"]/i);
        if (classIdMatch) {
          dashboardRef = classIdMatch[1];
        }
      }
      
      let upcomingDue = '';
      let courseType = '';
      let facultyName = '';
      
      if (cells.length >= 8) {
        const dueRaw = rawCells[4] || '';
        upcomingDue = stripTags(dueRaw.replace(/<br\s*\/?>/gi, ' | '));
        courseType = cells[5] || '';
        facultyName = cells[6] || '';
      } else {
        courseType = cells[4] || '';
        facultyName = cells[5] || '';
      }

      // Use classNumber as dashboardRef since HTML doesn't contain the class ID
      if (!dashboardRef && cells[1]) {
        dashboardRef = cells[1]; // Use class number (e.g., VL2025260101665)
      }
      
      const assignment = {
        index: cells[0],
        classNumber: cells[1],
        courseCode: cells[2],
        courseTitle: cells[3],
        upcomingDue,
        courseType,
        facultyName,
        dashboardRef,
      };
      
      // Debug logging
      console.log(`Parsed assignment: ${assignment.courseCode} - ${assignment.courseTitle}`);
      console.log(`  Course Type: "${assignment.courseType}"`);
      console.log(`  Faculty: "${assignment.facultyName}"`);
      console.log(`  Dashboard Ref: "${assignment.dashboardRef}" (classNumber: ${assignment.classNumber})`);

      assignments.push(assignment);
    }
  }

  return assignments;
}

// Exam Schedule Parser - Using CLI method
export async function getExamSchedule(sessionData, semesterLabel = null) {
  if (!sessionData || !sessionData.cookies || !sessionData.context) {
    throw new Error('Invalid session data');
  }

  const { cookies, context } = sessionData;
  
  console.log('=== Fetching Exam Schedule ===');
  console.log('Context:', {
    authorizedId: context.authorizedId,
    csrfName: context.csrfName,
    hasCsrfValue: !!context.csrfValue
  });

  // Step 1: Fetch initial exam schedule page (like CLI does)
  const actionUrl = `${APP_BASE_URL}examinations/StudExamSchedule`;
  
  const params = new URLSearchParams();
  params.append('verifyMenu', 'true');
  params.append('authorizedID', context.authorizedId);
  params.append(context.csrfName || '_csrf', context.csrfValue);
  
  await delay(1000); // CLI delay
  
  console.log('Fetching exam schedule page...');
  const response = await fetchWithCaptchaHandling(actionUrl, cookies, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch exam schedule: ${response.status} ${response.statusText}`);
  }

  const initialHtml = await response.text();
  console.log('Exam schedule page received, parsing...');
  
  // Step 2: Parse semester options (like CLI does)
  const semesters = parseSemesterOptions(initialHtml);
  
  if (semesters.length === 0) {
    console.warn('No semesters found in exam schedule page');
    return { schedule: {}, semester: null };
  }
  
  console.log(`Found ${semesters.length} available semesters`);
  
  // Step 3: Select semester (use CLI's logic)
  let selectedSemester = null;
  
  // If a target semester is specified, try to find it (CLI logic)
  if (semesterLabel) {
    const found = semesters.find(
      (s) => s.text.toLowerCase().includes(semesterLabel.toLowerCase()) || s.value === semesterLabel
    );
    if (found) selectedSemester = found;
  }
  
  // Look for "selected" attribute (CLI logic)
  if (!selectedSemester) {
    const selectedMatch = initialHtml.match(/<option\s+value=["']([^"']+)["'][^>]*selected[^>]*>([^<]+)<\/option>/i);
    if (selectedMatch) {
      selectedSemester = {
        value: selectedMatch[1].trim(),
        text: stripTags(selectedMatch[2]),
      };
    }
  }
  
  // Default to first semester (CLI logic)
  if (!selectedSemester) {
    selectedSemester = semesters[0];
  }
  
  console.log(`Selected semester: ${selectedSemester.text}`);
  
  // Step 4: Fetch exam schedule for the semester
  const scheduleHtml = await fetchExamScheduleForSemester(
    cookies,
    context,
    selectedSemester.value
  );
  
  
  // Step 5: Parse the schedule
  const schedule = parseExamSchedule(scheduleHtml);
  
  console.log(`Parsed exam schedule:`, {
    FAT: schedule.FAT?.length || 0,
    CAT1: schedule.CAT1?.length || 0,
    CAT2: schedule.CAT2?.length || 0
  });

  return {
    semester: selectedSemester,
    schedule,
  };
}

// CLI-style exam schedule parsing (exact copy from CLI)
const parseSemesterOptions = (html) => {
  const semesters = [];
  
  // Match all option tags in the semester dropdown (CLI's exact regex)
  const optionRegex = /<option\s+value=["']([^"']+)["'][^>]*>([^<]+)<\/option>/gi;
  let match;
  
  while ((match = optionRegex.exec(html)) !== null) {
    const value = match[1].trim();
    const text = stripTags(match[2]);
    
    // Skip empty values (CLI's exact logic)
    if (value && value !== '' && !text.includes('Choose Semester')) {
      semesters.push({
        value,
        text,
      });
    }
  }
  
  return semesters;
};

const fetchExamScheduleForSemester = async (cookies, context, semesterValue) => {
  // Use CLI's exact URL
  const url = `${APP_BASE_URL}examinations/doSearchExamScheduleForStudent`;
  
  const params = new URLSearchParams();
  params.append('authorizedID', context.authorizedId);
  params.append(context.csrfName || '_csrf', context.csrfValue);
  params.append('semesterSubId', semesterValue);
  
  await delay(500); // CLI delay
  
  console.log(`    ↳ POST ${url} (semester: ${semesterValue})`);
  
  const response = await fetchWithCaptchaHandling(url, cookies, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch exam schedule for semester: ${response.status} ${response.statusText}`);
  }
  
  return response.text();
};

const parseExamSchedule = (html) => {
  const exams = {
    FAT: [],
    CAT2: [],
    CAT1: [],
  };
  
  // Find the table container (CLI's exact logic)
  const tableMatch = html.match(/<div[^>]*class=["'][^"']*fixedTableContainer[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  
  if (!tableMatch) {
    console.warn('Could not find exam schedule table');
    return exams;
  }
  
  const tableHtml = tableMatch[1];
  
  // Split by exam type headers (FAT, CAT2, CAT1) - CLI's exact regex
  const examTypeRegex = /<tr[^>]*class=["'][^"']*tableContent[^"']*["'][^>]*>\s*<td[^>]*class=["'][^"']*panelHead-secondary[^"']*["'][^>]*[^>]*>(FAT|CAT2|CAT1)(?:<button[^>]*>.*?<\/button>)?<\/td>\s*<\/tr>/gi;
  
  let currentType = null;
  const sections = [];
  let lastIndex = 0;
  let match;
  
  while ((match = examTypeRegex.exec(tableHtml)) !== null) {
    if (currentType) {
      sections.push({
        type: currentType,
        html: tableHtml.substring(lastIndex, match.index),
      });
    }
    currentType = match[1];
    lastIndex = match.index + match[0].length;
  }
  
  // Add the last section
  if (currentType) {
    sections.push({
      type: currentType,
      html: tableHtml.substring(lastIndex),
    });
  }
  
  // Parse each section (CLI's exact logic)
  sections.forEach((section) => {
    const rows = parseExamRows(section.html);
    exams[section.type] = rows;
  });
  
  return exams;
};

const parseExamRows = (html) => {
  const exams = [];
  
  // Match table rows (CLI's exact regex)
  const rowRegex = /<tr[^>]*class=["'][^"']*tableContent[^"']*["'][^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[1];
    
    // Skip if it's a header row or empty (CLI's exact logic)
    if (rowHtml.includes('panelHead-secondary') || rowHtml.includes('colspan')) {
      continue;
    }
    
    // Extract cells
    const cells = [];
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cellMatch;
    
    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      cells.push(cellMatch[1]);
    }
    
    if (cells.length >= 13) {
      // Parse exam information (CLI's exact structure)
      const exam = {
        slNo: stripTags(cells[0]),
        courseCode: stripTags(cells[1]),
        courseTitle: stripTags(cells[2]),
        courseType: stripTags(cells[3]),
        classId: stripTags(cells[4]),
        slot: stripTags(cells[5]),
        examDate: stripTags(cells[6]),
        examSession: stripTags(cells[7]),
        reportingTime: stripTags(cells[8]),
        examTime: stripTags(cells[9]),
        venue: stripTags(cells[10]),
        seatLocation: stripTags(cells[11]),
        seatNo: stripTags(cells[12]),
      };
      
      exams.push(exam);
    }
  }
  
  return exams;
};

// Intent Detection - determines if a query is VTOP-related
export function detectVtopIntent(prompt) {
  const lowerPrompt = prompt.toLowerCase();
  
  const intents = {
    attendance: {
      keywords: ['attendance', 'present', 'absent', 'classes attended', 'how many classes', 'my attendance'],
      priority: 1,
    },
    assignments: {
      keywords: ['assignment', 'assignments', 'digital assignment', 'da', 'due', 'upcoming assignment', 'pending assignment'],
      priority: 2,
    },
    exams: {
      keywords: ['exam', 'exams', 'examination', 'test', 'cat', 'fat', 'exam schedule', 'exam date', 'when is exam'],
      priority: 3,
    },
    faculty: {
      keywords: ['faculty', 'professor', 'teacher', 'instructor', 'contact faculty'],
      priority: 4,
    },
  };

  for (const [intent, config] of Object.entries(intents)) {
    for (const keyword of config.keywords) {
      if (lowerPrompt.includes(keyword)) {
        return intent;
      }
    }
  }

  return null;
}

// Format responses for the chatbot
export function formatAttendanceResponse(courses) {
  if (!courses || courses.length === 0) {
    return "I couldn't find any attendance data. Make sure you're logged into VTOP.";
  }

  const avgAttendance = (courses.reduce((sum, c) => sum + c.attendance, 0) / courses.length).toFixed(1);
  
  let response = `📊 **Your Attendance Summary**\n\n`;
  
  courses.forEach((course, index) => {
    let emoji = '🟢';
    if (course.attendanceStatus === 'danger') emoji = '🔴';
    else if (course.attendanceStatus === 'warning') emoji = '🟡';
    else if (course.attendanceStatus === 'good') emoji = '🔵';
    
    response += `${emoji} **${course.courseCode}** - ${course.courseName}\n`;
    response += `   Type: ${course.courseType} | Attendance: **${course.attendance}%**\n\n`;
  });
  
  response += `\n📈 Average Attendance: **${avgAttendance}%**`;
  
  if (parseFloat(avgAttendance) < 75) {
    response += `\n\n⚠️ Warning: Your attendance is below 75%. Please attend more classes to avoid academic penalties.`;
  }
  
  return response;
}

export function formatAssignmentsResponse(data) {
  if (!data || !data.assignments || data.assignments.length === 0) {
    return "No assignments found for the current semester.";
  }

  let response = `📝 **Digital Assignments - ${data.semester.label}**\n\n`;
  
  data.assignments.forEach((assignment) => {
    response += `${assignment.index}. **${assignment.courseCode}** - ${assignment.courseTitle}\n`;
    response += `   Type: ${assignment.courseType}\n`;
    response += `   Due: ${assignment.upcomingDue}\n`;
    response += `   Faculty: ${assignment.facultyName}\n\n`;
  });
  
  return response;
}

export function formatExamScheduleResponse(data, examType = 'all') {
  if (!data || !data.schedule) {
    return "No exam schedule found.";
  }

  let response = `📅 **Exam Schedule - ${data.semester?.text || data.semester?.label || 'Current Semester'}**\n\n`;
  
  const examTypes = examType === 'all' ? ['CAT1', 'CAT2', 'FAT'] : [examType.toUpperCase()];
  
  examTypes.forEach((type) => {
    const exams = data.schedule[type] || [];
    
    if (exams.length === 0) return;
    
    let typeEmoji = '📝';
    if (type === 'CAT1') typeEmoji = '📖';
    else if (type === 'CAT2') typeEmoji = '📚';
    
    response += `${typeEmoji} **${type} EXAMS**\n\n`;
    
    exams.forEach((exam, index) => {
      response += `${index + 1}. **${exam.courseCode}** - ${exam.courseTitle}\n`;
      response += `   📅 Date: ${exam.examDate} | Session: ${exam.examSession}\n`;
      response += `   ⏰ Time: ${exam.examTime}\n`;
      if (exam.venue && exam.venue !== '-') {
        response += `   📍 Venue: ${exam.venue} | Seat: ${exam.seatNo}\n`;
      }
      response += `\n`;
    });
  });
  
  return response;
}

export function formatFacultyResponse(results, searchQuery) {
  if (!results || results.length === 0) {
    return `No faculty members found matching "${searchQuery}".`;
  }

  let response = `👥 **Faculty Search Results for "${searchQuery}"**\n\n`;
  
  results.forEach((faculty, index) => {
    response += `${index + 1}. **${faculty.name}**\n`;
    response += `   Designation: ${faculty.designation}\n`;
    response += `   School: ${faculty.school}\n`;
    response += `   Email: ${faculty.email}\n\n`;
  });
  
  return response;
}

// AI-powered exam schedule formatting
export async function formatExamScheduleWithAI(examData, userQuery) {
  if (!examData || !examData.schedule) {
    return "No exam schedule found.";
  }

  const { schedule, semester } = examData;
  
  // Analyze user query to determine what exams to show
  const query = userQuery.toLowerCase();
  
  let filteredSchedule = { FAT: [], CAT1: [], CAT2: [] };
  let responseTitle = `📅 **Exam Schedule - ${semester?.text || 'Current Semester'}**`;
  
  // Determine which exam types to show based on query
  if (query.includes('cat1') || query.includes('cat 1') || query.includes('cat-i')) {
    filteredSchedule.CAT1 = schedule.CAT1 || [];
    responseTitle = `📖 **CAT1 Exams - ${semester?.text || 'Current Semester'}**`;
  } else if (query.includes('cat2') || query.includes('cat 2') || query.includes('cat-ii')) {
    filteredSchedule.CAT2 = schedule.CAT2 || [];
    responseTitle = `📚 **CAT2 Exams - ${semester?.text || 'Current Semester'}**`;
  } else if (query.includes('fat') || query.includes('final') || query.includes('end semester')) {
    filteredSchedule.FAT = schedule.FAT || [];
    responseTitle = `📝 **FAT Exams - ${semester?.text || 'Current Semester'}**`;
  } else if (query.includes('upcoming') || query.includes('next') || query.includes('soon')) {
    // Show all exams but prioritize upcoming ones
    filteredSchedule = schedule;
    responseTitle = `📅 **Upcoming Exams - ${semester?.text || 'Current Semester'}**`;
  } else {
    // Default: show all exams
    filteredSchedule = schedule;
  }
  
  // Check if any exams found
  const totalExams = (filteredSchedule.FAT?.length || 0) + 
                    (filteredSchedule.CAT1?.length || 0) + 
                    (filteredSchedule.CAT2?.length || 0);
  
  if (totalExams === 0) {
    if (query.includes('cat1') || query.includes('cat2') || query.includes('fat')) {
      return `No ${query.includes('cat1') ? 'CAT1' : query.includes('cat2') ? 'CAT2' : 'FAT'} exams found for this semester.`;
    }
    return "No exams found for this semester.";
  }
  
  let response = `${responseTitle}\n\n`;
  
  // Format each exam type
  const examTypes = ['CAT1', 'CAT2', 'FAT'];
  const examEmojis = { CAT1: '📖', CAT2: '📚', FAT: '📝' };
  
  examTypes.forEach((type) => {
    const exams = filteredSchedule[type] || [];
    
    if (exams.length === 0) return;
    
    response += `${examEmojis[type]} **${type} EXAMS** (${exams.length} exams)\n\n`;
    
    exams.forEach((exam, index) => {
      response += `${index + 1}. **${exam.courseCode}** - ${exam.courseTitle}\n`;
      response += `   📅 Date: ${exam.examDate} | Session: ${exam.examSession}\n`;
      response += `   ⏰ Time: ${exam.examTime}\n`;
      if (exam.venue && exam.venue !== '-') {
        response += `   📍 Venue: ${exam.venue} | Seat: ${exam.seatNo}\n`;
      }
      response += `\n`;
    });
  });
  
  return response;
}



// AI-powered assignments formatting with deadline intelligence
export async function getAssignmentDetails(sessionData, classId) {
  if (!sessionData || !sessionData.cookies || !sessionData.context) {
    throw new Error('Invalid session data');
  }

  const { cookies, context } = sessionData;
  
  console.log('=== Fetching Assignment Details ===');
  console.log('Class ID:', classId);
  
  try {
    const detailsHtml = await fetchAssignmentDetails(cookies, context, classId);
    const details = parseAssignmentDetails(detailsHtml);
    
    console.log('✓ Assignment details fetched:', {
      courseInfo: details?.courseInfo?.courseCode,
      assignmentCount: details?.assignments?.length || 0
    });
    
    return details;
  } catch (error) {
    console.error('Error fetching assignment details:', error);
    throw error;
  }
}

export async function formatAssignmentsWithAI(assignmentsData, userQuery) {
  if (!assignmentsData || !assignmentsData.assignments) {
    return "No assignments found for the current semester.";
  }

  const { assignments, semester } = assignmentsData;
  
  // Analyze user query to determine what assignments to show
  const query = userQuery.toLowerCase();
  
  let filteredAssignments = assignments;
  let responseTitle = `📝 **Digital Assignments - ${semester?.label || "Current Semester"}**`;
  
  // Determine which assignments to show based on query
  if (query.includes("upcoming") || query.includes("due soon") || query.includes("deadline")) {
    // Show assignments with upcoming deadlines (next 7 days)
    const now = new Date();
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    filteredAssignments = assignments.filter(assignment => {
      if (!assignment.dueDate) return false;
      const dueDate = new Date(assignment.dueDate);
      return dueDate >= now && dueDate <= nextWeek;
    });
    
    responseTitle = `⏰ **Upcoming Assignments (Next 7 Days) - ${semester?.label || "Current Semester"}**`;
  } else if (query.includes("overdue") || query.includes("late") || query.includes("missed")) {
    // Show overdue assignments
    const now = new Date();
    
    filteredAssignments = assignments.filter(assignment => {
      if (!assignment.dueDate) return false;
      const dueDate = new Date(assignment.dueDate);
      return dueDate < now;
    });
    
    responseTitle = `🚨 **Overdue Assignments - ${semester?.label || "Current Semester"}**`;
  } else if (query.includes("pending") || query.includes("not submitted") || query.includes("incomplete")) {
    // Show pending assignments (not submitted)
    filteredAssignments = assignments.filter(assignment => 
      !assignment.status || assignment.status.toLowerCase().includes("pending") || 
      assignment.status.toLowerCase().includes("not submitted")
    );
    
    responseTitle = `📋 **Pending Assignments - ${semester?.label || "Current Semester"}**`;
  } else if (query.includes("submitted") || query.includes("completed") || query.includes("done")) {
    // Show submitted assignments
    filteredAssignments = assignments.filter(assignment => 
      assignment.status && assignment.status.toLowerCase().includes("submitted")
    );
    
    responseTitle = `✅ **Submitted Assignments - ${semester?.label || "Current Semester"}**`;
  } else {
    // Default: show all assignments
    filteredAssignments = assignments;
  }
  
  // Sort by due date (earliest first)
  filteredAssignments.sort((a, b) => {
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return new Date(a.dueDate) - new Date(b.dueDate);
  });
  
  if (filteredAssignments.length === 0) {
    if (query.includes("upcoming") || query.includes("due soon")) {
      return "No upcoming assignments in the next 7 days. Great job staying on top of your work! 🎉";
    } else if (query.includes("overdue")) {
      return "No overdue assignments found. You are all caught up! ✅";
    } else if (query.includes("pending")) {
      return "No pending assignments found. All assignments are submitted! 🎊";
    }
    return "No assignments found for this semester.";
  }
  
  let response = `${responseTitle}

`;
  
  // Add summary
  const now = new Date();
  const upcomingCount = assignments.filter(a => {
    if (!a.dueDate) return false;
    const dueDate = new Date(a.dueDate);
    return dueDate >= now && dueDate <= new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  }).length;
  
  const overdueCount = assignments.filter(a => {
    if (!a.dueDate) return false;
    return new Date(a.dueDate) < now;
  }).length;
  
  response += `📊 **Summary:** ${filteredAssignments.length} assignments found
`;
  if (upcomingCount > 0) response += `⏰ **Upcoming:** ${upcomingCount} due in next 7 days
`;
  if (overdueCount > 0) response += `🚨 **Overdue:** ${overdueCount} past due
`;
  response += `
`;
  
  // Format each assignment
  filteredAssignments.forEach((assignment, index) => {
    const dueDate = assignment.dueDate ? new Date(assignment.dueDate) : null;
    const now = new Date();
    
    // Determine urgency
    let urgencyEmoji = "📝";
    let urgencyText = "";
    
    if (dueDate) {
      const daysUntilDue = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
      
      if (daysUntilDue < 0) {
        urgencyEmoji = "🚨";
        urgencyText = ` (OVERDUE by ${Math.abs(daysUntilDue)} days)`;
      } else if (daysUntilDue === 0) {
        urgencyEmoji = "⚠️";
        urgencyText = " (DUE TODAY!)";
      } else if (daysUntilDue <= 1) {
        urgencyEmoji = "🔥";
        urgencyText = ` (DUE TOMORROW!)`;
      } else if (daysUntilDue <= 3) {
        urgencyEmoji = "⚡";
        urgencyText = ` (DUE IN ${daysUntilDue} DAYS)`;
      } else if (daysUntilDue <= 7) {
        urgencyEmoji = "⏰";
        urgencyText = ` (DUE IN ${daysUntilDue} DAYS)`;
      }
    }
    
    response += `${index + 1}. ${urgencyEmoji} **${assignment.courseCode}** - ${assignment.title}
`;
    response += `   📅 Due Date: ${assignment.dueDate || "Not specified"}${urgencyText}
`;
    response += `   👨‍🏫 Faculty: ${assignment.facultyName || "Not specified"}
`;
    if (assignment.status) {
      response += `   📋 Status: ${assignment.status}
`;
    }
    response += `
`;
  });
  
  return response;
}

// ============================================================================
// FACULTY SEARCH FUNCTIONS
// ============================================================================

const resolveUrl = (path, baseUrl) => {
  if (!baseUrl) return path;
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const relPath = path.startsWith('/') ? path.slice(1) : path;
  return `${base}${relPath}`;
};

// Step 1: Search for faculty by name
async function searchFaculty(cookies, context, searchQuery) {
  const actionUrl = resolveUrl('hrms/EmployeeSearchForStudent', APP_BASE_URL);
  
  const params = new URLSearchParams();
  params.append('_csrf', context.csrfValue);
  params.append('authorizedID', context.authorizedId);
  params.append('x', new Date().toUTCString());
  params.append('empId', searchQuery.toLowerCase());
  
  await delay(500);
  console.log(`  → POST ${actionUrl} (searching for: ${searchQuery})`);
  
  const response = await fetchWithCaptchaHandling(actionUrl, cookies, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  
  if (!response.ok) {
    throw new Error(`Faculty search failed: ${response.status}`);
  }
  
  return response.text();
}

// Step 2: Parse faculty search results
function parseFacultyResults(html) {
  const results = [];
  
  // Match table rows
  const rowRegex = /<tr[^>]*style=["'][^"']*text-align:\s*center[^"']*["'][^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[1];
    
    // Skip header rows
    if (rowHtml.includes('Name of the Faculty') || rowHtml.includes('background-color: #afbadc')) {
      continue;
    }
    
    // Extract cells
    const cells = [];
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cellMatch;
    
    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      cells.push(cellMatch[1]);
    }
    
    if (cells.length >= 4) {
      // Extract employee ID from button
      const idMatch = rowHtml.match(/id=["'](\d+)["']/);
      const employeeId = idMatch ? idMatch[1] : null;
      
      if (!employeeId) continue;
      
      const faculty = {
        employeeId,
        name: stripTags(cells[0]),
        designation: stripTags(cells[1]),
        school: stripTags(cells[2]),
      };
      
      console.log(`Parsed faculty: ${faculty.name} - ${faculty.designation} - ${faculty.school}`);
      console.log(`Raw cells: [${cells.map(c => `"${c.substring(0, 50)}..."`).join(', ')}]`);
      
      results.push(faculty);
    }
  }
  
  return results;
}

// Step 3: Fetch faculty details by employee ID
async function fetchFacultyDetails(cookies, context, employeeId) {
  const actionUrl = resolveUrl('hrms/EmployeeSearch1ForStudent', APP_BASE_URL);
  
  const params = new URLSearchParams();
  params.append('_csrf', context.csrfValue);
  params.append('authorizedID', context.authorizedId);
  params.append('x', new Date().toUTCString());
  params.append('empId', employeeId);
  
  await delay(500);
  console.log(`    ↳ POST ${actionUrl} (employeeId: ${employeeId})`);
  
  const response = await fetchWithCaptchaHandling(actionUrl, cookies, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  
  if (!response.ok) {
    throw new Error(`Faculty details fetch failed: ${response.status}`);
  }
  
  return response.text();
}

// Step 4: Parse faculty details
function parseFacultyDetails(html) {
  const details = {};
  
  // Extract basic info
  const nameMatch = html.match(/<td[^>]*style=["'][^"']*background-color:\s*#ABA5BF[^"']*["'][^>]*>\s*<b>Name of the Faculty\s*<\/b>\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i);
  if (nameMatch) details.name = stripTags(nameMatch[1]);
  
  const designationMatch = html.match(/<td[^>]*>\s*<b>Designation<\/b>\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i);
  if (designationMatch) details.designation = stripTags(designationMatch[1]);
  
  const deptMatch = html.match(/<td[^>]*>\s*<b>Name of Department<\/b>\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i);
  if (deptMatch) details.department = stripTags(deptMatch[1]);
  
  const schoolMatch = html.match(/<td[^>]*>\s*<b>School \/ Centre Name\s*<\/b>\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i);
  if (schoolMatch) details.school = stripTags(schoolMatch[1]);
  
  const emailMatch = html.match(/<td[^>]*>\s*<b>E-Mail Id\s*<\/b>\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i);
  if (emailMatch) details.email = stripTags(emailMatch[1]);
  
  const cabinMatch = html.match(/<td[^>]*>\s*<b>\s*Cabin Number\s*<\/b>\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i);
  if (cabinMatch) details.cabin = stripTags(cabinMatch[1]) || 'N/A';
  
  // Extract faculty photo - look for base64 images or regular image URLs
  const photoMatch = html.match(/<img[^>]*src=["']([^"']*data:image[^"']*|.*\/images\/.*|.*photo.*)["'][^>]*>/i);
  if (photoMatch) {
    details.photoUrl = photoMatch[1];
    // Make sure it's a full URL for relative paths
    if (details.photoUrl.startsWith('/') && !details.photoUrl.startsWith('data:')) {
      details.photoUrl = `${BASE_URL}${details.photoUrl}`;
    }
    console.log('Found faculty photo:', details.photoUrl.substring(0, 100) + '...');
  } else {
    console.log('No faculty photo found in HTML');
    // Debug: Look for any img tags
    const allImgTags = html.match(/<img[^>]*>/gi);
    if (allImgTags) {
      console.log('Found img tags:', allImgTags.length);
      console.log('Sample img tag:', allImgTags[0]);
    }
  }
  
  // Extract open hours - try multiple patterns
  details.openHours = [];
  
  // Debug: Save HTML for inspection
  console.log('Faculty details HTML sample:', html.substring(0, 2000));
  console.log('Looking for OPEN HOURS in HTML...');
  const hasOpenHours = html.includes('OPEN HOURS');
  console.log('Contains OPEN HOURS:', hasOpenHours);
  
  // Pattern 1: Look for office hours table with specific styling (exact match from HTML)
  // First try to find the OPEN HOURS table specifically
  const openHoursTableMatch = html.match(/OPEN HOURS[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/i);
  if (openHoursTableMatch) {
    const tbodyHtml = openHoursTableMatch[1];
    const rowRegex = /<tr[^>]*role=["']row["'][^>]*style=["'][^"']*background-color:\s*#f2dede[^"']*["'][^>]*class=["']odd["'][^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    
    while ((rowMatch = rowRegex.exec(tbodyHtml)) !== null) {
      const rowHtml = rowMatch[1];
      const cells = [];
      const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      let cellMatch;
      
      while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
        cells.push(stripTags(cellMatch[1]));
      }
      
      if (cells.length >= 2 && cells[0] && cells[1]) {
        details.openHours.push({
          day: cells[0],
          timing: cells[1],
        });
      }
    }
  }
  
  // Pattern 1b: If no OPEN HOURS table found, try general pattern
  if (details.openHours.length === 0) {
    let hoursRegex = /<tr[^>]*role=["']row["'][^>]*style=["'][^"']*background-color:\s*#f2dede[^"']*["'][^>]*class=["']odd["'][^>]*>([\s\S]*?)<\/tr>/gi;
    let hoursMatch;
    
    while ((hoursMatch = hoursRegex.exec(html)) !== null) {
      const rowHtml = hoursMatch[1];
      
      const cells = [];
      const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      let cellMatch;
      
      while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
        cells.push(stripTags(cellMatch[1]));
      }
      
      if (cells.length >= 2 && cells[0] && cells[1]) {
        details.openHours.push({
          day: cells[0],
          timing: cells[1],
        });
      }
    }
  }
  
  // Pattern 2: Look for "OPEN HOURS" table specifically
  if (details.openHours.length === 0) {
    const openHoursSection = html.match(/OPEN HOURS[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/i);
    if (openHoursSection) {
      const tbodyHtml = openHoursSection[1];
      const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let rowMatch;
      
      while ((rowMatch = rowRegex.exec(tbodyHtml)) !== null) {
        const rowHtml = rowMatch[1];
        const cells = [];
        const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
        let cellMatch;
        
        while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
          cells.push(stripTags(cellMatch[1]));
        }
        
        if (cells.length >= 2 && cells[0] && cells[1] && 
            !cells[0].toLowerCase().includes('week day') && 
            !cells[1].toLowerCase().includes('timings')) {
          details.openHours.push({
            day: cells[0],
            timing: cells[1],
          });
        }
      }
    }
  }
  
  // Pattern 3: Look for any table with "Office Hours" or "Consultation Hours"
  if (details.openHours.length === 0) {
    const officeHoursSection = html.match(/Office Hours[\s\S]*?<table[^>]*>([\s\S]*?)<\/table>/i);
    if (officeHoursSection) {
      const tableHtml = officeHoursSection[1];
      const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let rowMatch;
      
      while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
        const rowHtml = rowMatch[1];
        const cells = [];
        const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
        let cellMatch;
        
        while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
          cells.push(stripTags(cellMatch[1]));
        }
        
        if (cells.length >= 2 && cells[0] && cells[1] && 
            !cells[0].toLowerCase().includes('day') && 
            !cells[1].toLowerCase().includes('time')) {
          details.openHours.push({
            day: cells[0],
            timing: cells[1],
          });
        }
      }
    }
  }
  
  // Pattern 4: Look for consultation hours in a different format
  if (details.openHours.length === 0) {
    const consultationMatch = html.match(/Consultation Hours?\s*:?\s*([^<]+)/i);
    if (consultationMatch) {
      const hoursText = consultationMatch[1].trim();
      if (hoursText && hoursText !== 'N/A' && hoursText !== 'Not specified') {
        details.openHours.push({
          day: 'Consultation Hours',
          timing: hoursText,
        });
      }
    }
  }
  
  console.log(`Parsed faculty details:`, {
    name: details.name,
    designation: details.designation,
    department: details.department,
    school: details.school,
    email: details.email,
    cabin: details.cabin,
    photoUrl: details.photoUrl,
    openHoursCount: details.openHours.length,
    openHours: details.openHours
  });
  
  console.log('Office hours parsing summary:');
  console.log('- Found OPEN HOURS table:', !!openHoursTableMatch);
  console.log('- Total office hours found:', details.openHours.length);
  if (details.openHours.length > 0) {
    console.log('- Office hours:', details.openHours);
  }
  
  return details;
}

// Main faculty search function
export async function getFacultySearch(sessionData, searchQuery) {
  if (!searchQuery || searchQuery.length < 3) {
    throw new Error('Search query must be at least 3 characters');
  }
  
  console.log('\n▶ Searching for faculty...');
  
  const { cookies, context } = sessionData;
  
  // Add timeout before searching
  await delay(1500);
  
  // Step 1: Search for faculty
  const searchHtml = await searchFaculty(cookies, context, searchQuery);
  
  // Step 2: Parse results
  const results = parseFacultyResults(searchHtml);
  
  if (results.length === 0) {
    console.log('  ✗ No faculty found matching your search.');
    return { results: [], searchQuery };
  }
  
  console.log(`  ✓ Found ${results.length} faculty member(s)`);
  
  return {
    results,
    searchQuery,
    timestamp: new Date().toISOString()
  };
}

// Get faculty details for a specific faculty member
export async function getFacultyDetails(sessionData, employeeId) {
  console.log(`\n▶ Fetching faculty details for employee ID: ${employeeId}`);
  
  const { cookies, context } = sessionData;
  
  // Step 1: Fetch faculty details
  const detailsHtml = await fetchFacultyDetails(cookies, context, employeeId);
  
  // Step 2: Parse details
  const details = parseFacultyDetails(detailsHtml);
  
  console.log('  ✓ Faculty details retrieved');
  
  return {
    details,
    employeeId,
    timestamp: new Date().toISOString()
  };
}
