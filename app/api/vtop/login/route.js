import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { setVtopSession, getVtopSession, deleteVtopSession } from "../../generate/route.js";
import { solveCaptchaFromBase64 } from '../../../../lib/captcha/nodeSolver.js';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

console.log('✓ Captcha solver loaded from lib/captcha/');
console.log('✓ solveCaptchaFromBase64 available:', typeof solveCaptchaFromBase64);

// VTOP Login Logic (adapted from VTOP-CLI)
const BASE_URL = 'https://vtop.vit.ac.in';
const LOGIN_URL = `${BASE_URL}/vtop/login`;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchWithTimeout = async (url, options = {}, timeoutMs = 30000) => {
  const MAX_RETRIES = 3;
  const RETRYABLE_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND']);
  let lastError;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      // Retry on transient 5xx
      if (response.status >= 500 && response.status < 600 && attempt < MAX_RETRIES - 1) {
        const backoff = 300 * Math.pow(2, attempt);
        await delay(backoff);
        continue;
      }
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error;
      if (error.name === 'AbortError') {
        if (attempt < MAX_RETRIES - 1) {
          const backoff = 300 * Math.pow(2, attempt);
          await delay(backoff);
          continue;
        }
        throw new Error(`Request timeout after ${timeoutMs}ms`);
      }
      const code = error?.code || error?.cause?.code;
      if (RETRYABLE_CODES.has(code) && attempt < MAX_RETRIES - 1) {
        const backoff = 300 * Math.pow(2, attempt);
        await delay(backoff);
        continue;
      }
      throw error;
    }
  }
  throw lastError || new Error('Network request failed');
};

const storeCookies = (response, cookieJar) => {
  const raw = response.headers.getSetCookie?.() || [];
  raw.forEach((cookie) => {
    const [pair] = cookie.split(';');
    if (!pair) return;
    const eqIndex = pair.indexOf('=');
    if (eqIndex === -1) return;
    const name = pair.slice(0, eqIndex).trim();
    const value = pair.slice(eqIndex + 1).trim();
    if (name) {
      cookieJar.set(name, value);
    }
  });
};

const cookieHeader = (cookieJar) =>
  Array.from(cookieJar.entries())
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');

const fetchWithCookies = async (url, cookieJar, options = {}, timeoutMs = 30000) => {
  const headers = new Headers(options.headers || {});
  headers.set('User-Agent', USER_AGENT);
  if (!headers.has('Accept')) {
    headers.set('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
  }
  if (!headers.has('Accept-Language')) {
    headers.set('Accept-Language', 'en-US,en;q=0.9');
  }
  if (!headers.has('Cache-Control')) {
    headers.set('Cache-Control', 'no-cache');
  }
  if (!headers.has('Pragma')) {
    headers.set('Pragma', 'no-cache');
  }
  if (!headers.has('Upgrade-Insecure-Requests')) {
    headers.set('Upgrade-Insecure-Requests', '1');
  }
  if (!headers.has('Sec-Fetch-Site')) {
    headers.set('Sec-Fetch-Site', 'same-origin');
  }
  if (!headers.has('Sec-Fetch-Mode')) {
    headers.set('Sec-Fetch-Mode', 'navigate');
  }
  if (!headers.has('Sec-Fetch-Dest')) {
    headers.set('Sec-Fetch-Dest', 'document');
  }
  if (cookieJar.size > 0) {
    headers.set('Cookie', cookieHeader(cookieJar));
  }
  
  const response = await fetchWithTimeout(url, { ...options, headers }, timeoutMs);
  storeCookies(response, cookieJar);
  return response;
};

const extractCsrfToken = (html) => {
  const match = html.match(/name="_csrf"[^>]*value="([^"]+)"/i);
  if (!match) {
    throw new Error('Unable to locate CSRF token in login page.');
  }
  return match[1];
};

const extractCaptcha = (html) => {
  // Try multiple patterns to find captcha image
  const patterns = [
    // Pattern 1: id="captchaImage"
    /<img[^>]+id=["']captchaImage["'][^>]+src=["']\s*(data:image\/[^;]+;base64,[^"']+)["']/i,
    // Pattern 2: src first, then id
    /<img[^>]+src=["']\s*(data:image\/[^;]+;base64,[^"']+)["'][^>]*id=["']captchaImage["']/i,
    // Pattern 3: alt="vtopCaptcha"
    /<img[^>]+alt=["']vtopCaptcha["'][^>]+src=["']\s*(data:image\/[^;]+;base64,[^"']+)["']/i,
    // Pattern 4: src first, then alt
    /<img[^>]+src=["']\s*(data:image\/[^;]+;base64,[^"']+)["'][^>]*alt=["']vtopCaptcha["']/i,
    // Pattern 5: Any base64 image in captcha context
    /captcha[^>]*<img[^>]+src=["']\s*(data:image\/[^;]+;base64,[^"']+)["']/i,
    // Pattern 6: Generic base64 in login form
    /<img[^>]+src=["']\s*(data:image\/jpeg;base64,[A-Za-z0-9+/=]{200,})["']/i,
  ];
  
  for (let i = 0; i < patterns.length; i++) {
    const pattern = patterns[i];
    const match = html.match(pattern);
    if (match && match[1] && !match[1].includes('null') && match[1].length > 100) {
      console.log(`✓ Captcha found using pattern ${i + 1}`);
      console.log(`  Image data length: ${match[1].length} characters`);
      return match[1];
    }
  }
  
  console.log('⚠ No captcha image found in HTML');
  console.log('  Checking if captcha block exists:', html.includes('captchaBlock') ? 'YES' : 'NO');
  console.log('  Checking if captchaStr field exists:', html.includes('captchaStr') ? 'YES' : 'NO');
  
  return null;
};

const followRedirects = async (response, cookieJar, maxHops = 4) => {
  let current = response;
  for (let hop = 0; hop < maxHops; hop += 1) {
    const location = current.headers.get('location');
    if (location && current.status >= 300 && current.status < 400) {
      const nextUrl = new URL(location, LOGIN_URL).href;
      current = await fetchWithCookies(nextUrl, cookieJar, { redirect: 'manual' });
    } else {
      return current;
    }
  }
  return current;
};

const fetchCaptchaImage = async (cookieJar) => {
  try {
    console.log('→ Fetching fresh captcha image...');
    const captchaUrl = `${BASE_URL}/vtop/get/new/captcha?_=${Date.now()}`;
    const response = await fetchWithCookies(captchaUrl, cookieJar, {
      method: 'GET',
      headers: {
        'Accept': 'text/html,*/*',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: `${BASE_URL}/vtop/login`,
        Origin: BASE_URL,
      },
    });
    
    // Wait for captcha to be fully generated on server side
    await delay(800);
    
    const captchaHtml = await response.text();
    console.log('  Captcha HTML length:', captchaHtml.length);
    
    // Extract the captcha image from the response
    const captchaSrc = extractCaptcha(captchaHtml);
    if (captchaSrc) {
      console.log('✓ Fresh captcha extracted successfully');
      return captchaSrc;
    }
    
    console.warn('⚠ Could not extract captcha from response');
    return null;
  } catch (error) {
    console.error('✗ Failed to fetch fresh captcha:', error.message);
    return null;
  }
};

const fetchLoginPage = async (cookieJar) => {
  let response = await fetchWithCookies(LOGIN_URL, cookieJar, { redirect: 'manual' });
  response = await followRedirects(response, cookieJar);
  let html = await response.text();
  
  // Wait for page to fully load (especially dynamic elements like captcha)
  await delay(1500);
  
  for (let iteration = 0; iteration < 2; iteration += 1) {
    if (html.includes('id="vtopLoginForm"') || html.includes('captchaStr')) {
      return { html, url: response.url || LOGIN_URL };
    }
    if (html.includes('id="stdForm"')) {
      const csrf = extractCsrfToken(html);
      const flagMatch = html.match(/name="flag"[^>]*value="([^"]*)"/i);
      const actionMatch = html.match(/<form[^>]+id=["']stdForm["'][^>]*action=["']([^"']+)["']/i);
      const actionPath = actionMatch ? actionMatch[1] : '/vtop/prelogin/setup';
      const actionUrl = new URL(actionPath, LOGIN_URL).href;
      const params = new URLSearchParams();
      params.set('_csrf', csrf);
      params.set('flag', flagMatch ? flagMatch[1] : 'VTOP');
      const referer = response.url || LOGIN_URL;
      response = await fetchWithCookies(actionUrl, cookieJar, {
        method: 'POST',
        redirect: 'manual',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Referer: referer,
          Origin: BASE_URL,
        },
        body: params.toString(),
      });
      response = await followRedirects(response, cookieJar);
      html = await response.text();
      continue;
    }
    break;
  }
  return { html, url: response.url || LOGIN_URL };
};

const vtopLogin = async (username, password, retryCount = 0, cookieJar = null) => {
  cookieJar = cookieJar || new Map();
  const MAX_RETRIES = 3;
  
  console.log(`=== VTOP LOGIN ATTEMPT ${retryCount + 1}/${MAX_RETRIES} ===`);
  console.log('Username:', username);
  console.log('Password length:', password.length);
  
  const { html: loginHtml, url: loginPageUrl } = await fetchLoginPage(cookieJar);
  const csrf = extractCsrfToken(loginHtml);
  let captchaSrc = extractCaptcha(loginHtml);
  
  console.log('Login page URL:', loginPageUrl);
  console.log('CSRF token:', csrf.substring(0, 10) + '...');
  console.log('Captcha in initial HTML:', captchaSrc ? 'YES' : 'NO');
  
  // If no captcha in initial HTML, fetch it dynamically (VTOP loads it via AJAX)
  if (!captchaSrc && loginHtml.includes('captchaStr')) {
    console.log('→ Captcha field detected but no image in HTML, fetching dynamically...');
    // Wait a bit more for AJAX captcha to be ready
    await delay(800);
    captchaSrc = await fetchCaptchaImage(cookieJar);
  }
  
  console.log('Captcha available:', captchaSrc ? 'YES' : 'NO');
  
  let solvedCaptcha = '';
  
  // ALWAYS try to auto-solve captcha if available
  if (captchaSrc) {
    console.log('✓ Captcha detected on login page');
    
    if (!solveCaptchaFromBase64) {
      throw new Error('Captcha solver not available. Cannot proceed with automatic login.');
    }
    
    try {
      console.log('→ Attempting to auto-solve captcha...');
      solvedCaptcha = await solveCaptchaFromBase64(captchaSrc);
      // Normalize to expected format (VTOP expects 6 alphanumeric, usually uppercase)
      if (typeof solvedCaptcha === 'string') {
        solvedCaptcha = solvedCaptcha.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
      } else {
        solvedCaptcha = '';
      }
      console.log('✓ Captcha auto-solved:', solvedCaptcha);
      
      if (!solvedCaptcha || solvedCaptcha.length !== 6) {
        throw new Error('Invalid captcha solution length');
      }
      
      // Small delay to ensure captcha solution is properly processed
      await delay(500);
    } catch (error) {
      console.warn('✗ Auto-solve failed:', error.message);
      
      // If we haven't exceeded max retries, try again with a fresh captcha
      if (retryCount < MAX_RETRIES - 1) {
        console.log(`→ Retrying with fresh captcha (attempt ${retryCount + 2}/${MAX_RETRIES})...`);
        await delay(1000); // Small delay before retry
        return vtopLogin(username, password, retryCount + 1, cookieJar);
      }
      
      // Max retries exceeded
      return {
        success: false,
        error: 'Unable to solve captcha after multiple attempts. Please try again later.',
      };
    }
  } else {
    // No captcha detected - this is unusual for VTOP
    console.warn('⚠ No captcha detected on page - this is unusual!');
    solvedCaptcha = '';
  }

  const formParams = new URLSearchParams();
  formParams.set('_csrf', csrf);
  formParams.set('username', username.toUpperCase());
  formParams.set('password', password);
  formParams.set('captchaStr', solvedCaptcha);

  console.log('=== SUBMITTING LOGIN ===');
  console.log('Form data:');
  console.log('- _csrf:', csrf.substring(0, 15) + '...');
  console.log('- username:', username.toUpperCase());
  console.log('- password:', '***' + password.substring(password.length - 2));
  console.log('- captchaStr:', solvedCaptcha || '(empty)');
  
  // Small delay before submission to ensure all form data is ready
  await delay(300);

  const response = await fetchWithCookies(LOGIN_URL, cookieJar, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: loginPageUrl,
      Origin: BASE_URL,
    },
    body: formParams.toString(),
  });

  console.log('Response status:', response.status);
  console.log('Response location:', response.headers.get('location') || 'none');

  const finalResponse = await followRedirects(response, cookieJar);
  const finalUrl = finalResponse.url || '';
  const finalStatus = finalResponse.status;
  const finalHtml = await finalResponse.text();

  // Debug logging
  console.log('VTOP Login Debug:');
  console.log('- Final URL:', finalUrl);
  console.log('- Final Status:', finalStatus);
  console.log('- Cookies:', Array.from(cookieJar.keys()).join(', '));
  console.log('- HTML contains vtopLoginForm:', finalHtml.includes('id="vtopLoginForm"'));
  console.log('- HTML contains page-holder:', finalHtml.includes('id="page-holder"'));
  console.log('- HTML contains authorizedID:', finalHtml.includes('authorizedID'));

  const isLoginSuccess = 
    finalUrl.includes('/vtop/content') ||
    finalUrl.includes('/vtop/studentLogin') && !finalHtml.includes('id="vtopLoginForm"') ||
    finalHtml.includes('id="page-holder"') ||
    finalHtml.includes('vtop-body-content') ||
    finalHtml.includes('authorizedID') ||
    (finalHtml.includes('hmenuItem') && !finalHtml.includes('id="vtopLoginForm"'));

  if (isLoginSuccess) {
    console.log('✓ Login successful!');
    const context = extractDashboardContext(finalHtml);
    
    // Save debug HTML file
    try {
      const fs = require('fs');
      const path = require('path');
      const debugPath = path.join(process.cwd(), 'vtop-login-success.html');
      fs.writeFileSync(debugPath, finalHtml);
      console.log('✓ Saved login HTML to:', debugPath);
    } catch (err) {
      console.warn('Could not save debug HTML:', err.message);
    }
    
    return {
      success: true,
      cookies: Object.fromEntries(cookieJar.entries()),
      context,
      dashboardHtml: finalHtml,
    };
  }

  // Save debug HTML file for failed login
  try {
    const fs = require('fs');
    const path = require('path');
    const debugPath = path.join(process.cwd(), 'vtop-login-failed.html');
    fs.writeFileSync(debugPath, finalHtml);
    console.log('✗ Saved failed login HTML to:', debugPath);
  } catch (err) {
    console.warn('Could not save debug HTML:', err.message);
  }

  // Check for invalid credentials error (the only error we should show to user)
  if (finalHtml.includes('Invalid LoginId/Password') || 
      finalHtml.includes('text-danger') && finalHtml.includes('Invalid')) {
    console.log('✗ Invalid credentials detected');
    return { 
      success: false, 
      error: 'Invalid LoginId/Password. Please check your credentials and try again.' 
    };
  }

  // Check for captcha error
  const errorMatch = finalHtml.match(/alert\(['"]([^'"]+)['"]\)/i);
  if (errorMatch) {
    const errorMsg = errorMatch[1];
    console.log('✗ VTOP Error:', errorMsg);
    
    // If it's a captcha-related error and we have retries left, try again
    if ((errorMsg.toLowerCase().includes('captcha') || 
         errorMsg.toLowerCase().includes('verification code')) && 
        retryCount < MAX_RETRIES - 1) {
      console.log(`→ Captcha error detected, retrying (attempt ${retryCount + 2}/${MAX_RETRIES})...`);
      await delay(1000);
      // Get a fresh captcha within the same session/cookies
      const freshCaptcha = await fetchCaptchaImage(cookieJar);
      if (freshCaptcha) {
        let freshSolved = '';
        try {
          freshSolved = await solveCaptchaFromBase64(freshCaptcha);
          freshSolved = (freshSolved || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
        } catch {}
      }
      return vtopLogin(username, password, retryCount + 1, cookieJar);
    }
    
    // For other errors or max retries exceeded, return generic message
    return { 
      success: false, 
      error: 'Login failed. Please try again later.' 
    };
  }
  
  // Check for specific error page
  if (finalUrl.includes('/vtop/login/error')) {
    console.log('✗ VTOP returned error page - credentials or captcha rejected');
    
    // Check if it was a captcha issue
    if (captchaSrc && solvedCaptcha) {
      return {
        success: false,
        error: `Wrong captcha "${solvedCaptcha}". Click Refresh to get a new one.`,
        requiresRetry: true,
      };
    }
    
    // Otherwise it's credentials
    return {
      success: false,
      error: 'Invalid username or password. Please verify your VTOP credentials at vtop.vit.ac.in',
    };
  }
  
  // Check if still on login page (wrong captcha or credentials)
  if (finalHtml.includes('id="vtopLoginForm"') || finalHtml.includes('captchaStr')) {
    if (captchaSrc && solvedCaptcha) {
      console.log('✗ Still on login page - captcha was:', solvedCaptcha);
      return { 
        success: false, 
        error: `Captcha "${solvedCaptcha}" was rejected. Click Refresh for a new one.`,
        requiresRetry: true,
      };
    }
    if (captchaSrc && !solvedCaptcha) {
      return {
        success: false,
        error: 'Captcha field was empty. Please enter the 6-character captcha.',
        requiresRetry: true,
      };
    }
    console.log('✗ Invalid credentials - no captcha was shown');
    return { success: false, error: 'Invalid username or password. Verify at vtop.vit.ac.in first.' };
  }
  
  console.log('✗ Unknown error - check vtop-login-failed.html');
  return { success: false, error: 'Unexpected error. Check terminal logs for details.' };
};

const extractDashboardContext = (html) => {
  if (!html) return null;
  
  const csrfValueMatch = html.match(/var\s+csrfValue\s*=\s*["']([^"']+)["']/i);
  const csrfNameMatch = html.match(/var\s+csrfName\s*=\s*["']([^"']+)["']/i);
  const authorizedIdMatch = html.match(/var\s+id\s*=\s*["']([^"']+)["']/i) ||
                            html.match(/var\s+authorizedID\s*=\s*["']([^"']+)["']/i) ||
                            html.match(/id=["']authorizedIDX["'][^>]*value=["']([^"']+)["']/i);

  const fallbackCsrfValue = html.match(/name=["']_csrf["']\s+value=["']([^"']+)["']/i)?.[1];
  const fallbackAuthorizedId = html.match(/name=["']authorizedID["'][^>]*value=["']([^"']+)["']/i)?.[1];

  const csrfValue = csrfValueMatch?.[1] || fallbackCsrfValue;
  const csrfName = csrfNameMatch?.[1] || '_csrf';
  const authorizedId = authorizedIdMatch?.[1] || fallbackAuthorizedId;

  if (!csrfValue || !authorizedId) {
    return null;
  }

  return { csrfName, csrfValue, authorizedId };
};

export async function POST(req) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { username, password, captcha, action } = body;

    if (action === 'validate') {
      // Check if user has an active session
      const sessionData = getVtopSession(userId);
      if (sessionData) {
        return NextResponse.json({ 
          valid: true, 
          username: sessionData.username,
          timestamp: sessionData.timestamp,
        });
      }
      return NextResponse.json({ valid: false });
    }

    if (action === 'logout') {
      console.log(`=== VTOP Logout Request ===`);
      console.log(`User ID: ${userId}`);
      
      // Get current session before deleting
      const currentSession = getVtopSession(userId);
      if (currentSession) {
        console.log(`Current session found for: ${currentSession.username}`);
        
        // Try to logout from VTOP server if we have valid cookies
        try {
          if (currentSession.cookies && currentSession.context) {
            console.log(`Attempting VTOP server logout...`);
            
            // Make logout request to VTOP
            const logoutResponse = await fetch(`${BASE_URL}/vtop/logout`, {
              method: 'POST',
              headers: {
                'User-Agent': USER_AGENT,
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Requested-With': 'XMLHttpRequest',
                'Cookie': Object.entries(currentSession.cookies)
                  .map(([key, value]) => `${key}=${value}`)
                  .join('; '),
              },
              body: new URLSearchParams({
                [currentSession.context.csrfName]: currentSession.context.csrfValue,
              }),
            });
            
            if (logoutResponse.ok) {
              console.log(`✓ VTOP server logout successful`);
            } else {
              console.log(`⚠ VTOP server logout failed: ${logoutResponse.status}`);
            }
          } else {
            console.log(`⚠ No valid cookies/context for VTOP logout`);
          }
        } catch (error) {
          console.log(`⚠ VTOP server logout error: ${error.message}`);
          // Continue with local logout even if server logout fails
        }
      } else {
        console.log(`No active session found for logout`);
      }
      
      // Remove session from our storage
      deleteVtopSession(userId);
      console.log(`✓ Local session deleted`);
      
      return NextResponse.json({ success: true });
    }

    // Login action
    if (!username || !password) {
      return NextResponse.json({ error: "Username and password required" }, { status: 400 });
    }

    // Call vtopLogin without captcha parameter - it will auto-solve
    const result = await vtopLogin(username, password);

    // No more manual captcha requests - only success or error

    if (!result.success) {
      return NextResponse.json({ 
        error: result.error,
        requiresRetry: result.requiresRetry,
      }, { status: 401 });
    }

      // Store session in shared memory (exactly like CLI)
      const sessionData = {
        username,
        cookies: result.cookies,
        context: result.context,
        dashboardHtml: result.dashboardHtml, // Store dashboard HTML for attendance parsing
        timestamp: new Date().toISOString(),
        // Store cookies as individual key-value pairs like CLI
        cookieJar: result.cookies // result.cookies is already an object from vtopLogin
      };

    // Fetch and cache exam schedule and assignments during login for faster responses
    try {
      console.log('=== Pre-fetching Exam Schedule During Login ===');
      const { getExamSchedule } = await import('../../../../lib/vtopUtils.js');
      
      // Fetch exam schedule in background
      const examData = await getExamSchedule(sessionData);
      
      if (examData && examData.schedule) {
        sessionData.examSchedule = examData.schedule;
        sessionData.examSemester = examData.semester;
        console.log('✓ Exam schedule cached during login:', {
          FAT: examData.schedule.FAT?.length || 0,
          CAT1: examData.schedule.CAT1?.length || 0,
          CAT2: examData.schedule.CAT2?.length || 0,
          semester: examData.semester?.text
        });
      }
    } catch (examError) {
      console.warn('⚠ Could not pre-fetch exam schedule during login:', examError.message);
      // Don't fail login if exam fetch fails
    }

    // Fetch and cache digital assignments during login
    try {
      console.log('=== Pre-fetching Digital Assignments During Login ===');
      const { getDigitalAssignments } = await import('../../../../lib/vtopUtils.js');
      
      // Fetch assignments in background
      const assignmentsData = await getDigitalAssignments(sessionData);
      
      if (assignmentsData && assignmentsData.assignments) {
        sessionData.assignments = assignmentsData.assignments;
        sessionData.assignmentsSemester = assignmentsData.semester;
        console.log('✓ Digital assignments cached during login:', {
          totalAssignments: assignmentsData.assignments?.length || 0,
          semester: assignmentsData.semester?.label
        });
      }
    } catch (assignmentsError) {
      console.warn('⚠ Could not pre-fetch digital assignments during login:', assignmentsError.message);
      // Don't fail login if assignments fetch fails
    }
    
    console.log('=== Storing VTOP Session ===');
    console.log('User ID:', userId);
    console.log('Username:', username);
    console.log('Has cookies:', !!result.cookies);
    console.log('Has context:', !!result.context);
    
    await setVtopSession(userId, sessionData);
    
    // Verify it was stored
    const stored = await getVtopSession(userId);
    console.log('Session stored successfully:', !!stored);
    if (stored) {
      console.log('✓ Session verified in storage');
    } else {
      console.error('✗ Session NOT found after storing!');
    }

    return NextResponse.json({
      success: true,
      username,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error("VTOP login error:", error);
    return NextResponse.json({ 
      error: error.message || "Login failed" 
    }, { status: 500 });
  }
}

export async function GET(req) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check session validity
  const sessionData = await getVtopSession(userId);
  if (sessionData) {
    return NextResponse.json({ 
      valid: true, 
      username: sessionData.username,
      timestamp: sessionData.timestamp,
    });
  }

  return NextResponse.json({ valid: false });
}

