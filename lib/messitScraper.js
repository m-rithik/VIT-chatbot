// Puppeteer-based scraper for messit.vinnovateit.com
import puppeteer from 'puppeteer';

let browser = null;

// Initialize browser (reuse instance for better performance)
async function getBrowser() {
  if (browser) {
    try {
      // Check if browser is still connected
      await browser.version();
      return browser;
    } catch (error) {
      console.log('Browser disconnected, creating new instance...');
      browser = null;
    }
  }
  
  console.log('Launching Puppeteer browser...');
  browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1920x1080'
    ]
  });
  
  console.log('✓ Browser launched');
  return browser;
}

// Close browser (call this when shutting down the application)
export async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
    console.log('✓ Browser closed');
  }
}

// Scrape mess menu from messit.vinnovateit.com
// Website shows all 31 days at once (124 sections = 31 days × 4 meals)
export async function scrapeMessMenu(hostelType = 'MH', messType = 'Non-Veg', dayNumber = null) {
  let page = null;
  
  try {
    console.log('=== Scraping Mess Menu with Puppeteer ===');
    console.log('Hostel Type:', hostelType);
    console.log('Mess Type:', messType);
    console.log('Day Number:', dayNumber);
    
    const browserInstance = await getBrowser();
    page = await browserInstance.newPage();
    
    // Disable cache to ensure fresh content
    await page.setCacheEnabled(false);
    
    // Set user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Set viewport
    await page.setViewport({ width: 1920, height: 1080 });
    
    console.log('Navigating to messit website...');
    
    // Navigate to the details page with cache disabled
    await page.goto('https://messit.vinnovateit.com/details', {
      waitUntil: 'networkidle0',
      timeout: 30000
    });
    
    console.log('✓ Page loaded');
    
    // Wait for the page to be fully rendered
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Try to select hostel type
    console.log('Selecting hostel and mess type...');
    
    // Map hostel types
    const hostelMapping = {
      'MH': "Men's Hostel",
      'LH': "Ladies's Hostel" // Note the double 's' as shown in the HTML
    };
    
    const targetHostel = hostelMapping[hostelType] || "Men's Hostel";
    
    // Look for hostel selection buttons
    try {
      const hostelButtons = await page.$$('button');
      let hostelFound = false;
      
      for (const button of hostelButtons) {
        const text = await page.evaluate(el => el.textContent, button);
        // Check for exact match or partial match
        if (text.includes("Men's") || text.includes("Ladies") || text.includes("Hostel")) {
          if ((targetHostel.includes("Men's") && text.includes("Men's")) ||
              (targetHostel.includes("Ladies") && text.includes("Ladies"))) {
            await button.click();
            console.log(`✓ Selected hostel: ${text.trim()}`);
            await new Promise(resolve => setTimeout(resolve, 1500));
            hostelFound = true;
            break;
          }
        }
      }
      
      if (!hostelFound) {
        console.log('⚠ Could not select hostel, using default selection');
      }
    } catch (error) {
      console.log('⚠ Hostel selection error:', error.message);
    }
    
    // Look for mess type selection (combobox/dropdown)
    try {
      // Try to find the combobox trigger button
      const comboboxButton = await page.$('button[role="combobox"]');
      if (comboboxButton) {
        console.log('Found mess type combobox, clicking...');
        await comboboxButton.click();
        await new Promise(resolve => setTimeout(resolve, 800));
        
        // Wait for dropdown to appear and select the option
        const options = await page.$$('div[role="option"]');
        for (const option of options) {
          const text = await page.evaluate(el => el.textContent, option);
          if (text.includes(messType) || 
              (messType === 'Non-Veg' && text.includes('Non-Vegetarian')) ||
              (messType === 'Veg' && text.includes('Vegetarian')) ||
              (messType === 'Special' && text.includes('Special'))) {
            await option.click();
            console.log(`✓ Selected mess type: ${text.trim()}`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            break;
          }
        }
      } else {
        // Fallback to select element
        const selectElements = await page.$$('select');
        for (const select of selectElements) {
          const options = await select.$$('option');
          for (const option of options) {
            const text = await page.evaluate(el => el.textContent, option);
            if (text.includes(messType)) {
              await page.select(select, await page.evaluate(el => el.value, option));
              console.log(`✓ Selected mess type (select): ${messType}`);
              await new Promise(resolve => setTimeout(resolve, 1000));
              break;
            }
          }
        }
      }
    } catch (error) {
      console.log('⚠ Mess type selection error:', error.message);
    }
    
    // IMPORTANT: Submit the form to see the menu
    try {
      console.log('Looking for Submit button...');
      const submitButtons = await page.$$('button');
      let submitted = false;
      
      for (const button of submitButtons) {
        const text = await page.evaluate(el => el.textContent, button);
        if (text.trim() === 'Submit') {
          console.log('Found Submit button, clicking...');
          await button.click();
          submitted = true;
          console.log('✓ Form submitted');
          break;
        }
      }
      
      if (!submitted) {
        console.log('⚠ Could not find Submit button');
      }
    } catch (error) {
      console.log('⚠ Submit button error:', error.message);
    }
    
    // Wait for the meal sections to appear after selection
    console.log('Waiting for meal content to load...');
    
    try {
      // Wait for at least one meal section to appear
      await page.waitForSelector('section.grid', { timeout: 10000 });
      console.log('✓ Meal content loaded');
    } catch (error) {
      console.log('⚠ Timeout waiting for meal content, trying to extract anyway...');
    }
    
    // Additional wait for complete rendering
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Determine which day to extract
    // If no day specified, use today's date
    const today = new Date();
    const targetDay = dayNumber || today.getDate();
    
    console.log('Target day for extraction:', targetDay);
    
    // Verify content is loaded (optional debug in development)
    if (process.env.NODE_ENV === 'development') {
      const pageContent = await page.evaluate(() => {
        return {
          hasGridSection: !!document.querySelector('section.grid'),
          gridDivCount: document.querySelectorAll('section.grid > div').length,
          h2Count: document.querySelectorAll('h2').length
        };
      });
      console.log('Page structure:', JSON.stringify(pageContent));
    }
    
    // Extract menu data from the page
    console.log('Extracting menu data...');
    
    const menuData = await page.evaluate((targetDay) => {
      const meals = {
        breakfast: [],
        lunch: [],
        snacks: [],
        dinner: [],
        availableDates: []
      };
      
      // Extract meal sections - Updated for actual messit structure
      // IMPORTANT: Website shows ALL days' menus at once (31 days × 4 meals = 124 sections)
      // Pattern: [Day1-Breakfast, Day1-Lunch, Day1-Snacks, Day1-Dinner, Day2-Breakfast, ...]
      // Day 1 = sections 0-3, Day 2 = sections 4-7, Day N = sections (N-1)*4 to N*4-1
      try {
        // Look for the grid section containing meal cards
        const mealSections = document.querySelectorAll('section.grid > div');
        
        // Calculate section indices for the target day
        const startIndex = (targetDay - 1) * 4;
        const endIndex = targetDay * 4;
        
        // Extract the 4 sections for the target day
        const daySections = Array.from(mealSections).slice(startIndex, endIndex);
        
        daySections.forEach((section, idx) => {
          // Find the meal title (h2 element)
          const titleElement = section.querySelector('h2');
          if (!titleElement) return;
          
          const title = titleElement.textContent.trim().toLowerCase();
          
          // Find the items paragraph with class containing text-lg
          const itemsElement = section.querySelector('p[class*="text-lg"]');
          if (!itemsElement) return;
          
          // Split items by comma and clean them up
          const items = itemsElement.textContent
            .split(',')
            .map(item => item.trim())
            .filter(item => item.length > 0);
          
          // Map to the correct meal type
          if (title.includes('breakfast')) {
            meals.breakfast = items;
          } else if (title.includes('lunch')) {
            meals.lunch = items;
          } else if (title.includes('snacks') || title.includes('snack')) {
            meals.snacks = items;
          } else if (title.includes('dinner')) {
            meals.dinner = items;
          }
        });
        
        // Extract available dates from the total sections
        const totalSections = mealSections.length;
        const totalDays = Math.floor(totalSections / 4);
        const today = new Date();
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();
        const todayDay = today.getDate();
        
        for (let day = 1; day <= totalDays; day++) {
          meals.availableDates.push({
            dayNumber: day,
            isToday: day === todayDay,
            date: `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          });
        }
      } catch (error) {
        // Error handled outside evaluate
      }
      
      return meals;
    }, targetDay);
    
    console.log('✓ Menu extracted:', {
      breakfast: menuData.breakfast.length,
      lunch: menuData.lunch.length,
      snacks: menuData.snacks.length,
      dinner: menuData.dinner.length,
      availableDates: menuData.availableDates.length
    });
    
    if (menuData.breakfast.length > 0) {
      console.log('Sample items:', menuData.breakfast.slice(0, 3).join(', '));
    }
    
    // Close the page
    await page.close();
    
    // Return meals and available dates
    return {
      meals: {
        breakfast: menuData.breakfast,
        lunch: menuData.lunch,
        snacks: menuData.snacks,
        dinner: menuData.dinner
      },
      availableDates: menuData.availableDates
    };
    
  } catch (error) {
    console.error('Puppeteer scraping error:', error);
    
    // Close page on error
    if (page) {
      try {
        await page.close();
      } catch (closeError) {
        console.error('Error closing page:', closeError);
      }
    }
    
    throw new Error(`Failed to scrape mess menu: ${error.message}`);
  }
}

// Function removed: scrapeAvailableDates
// Reason: Website does not support date-specific menus, only today's menu is available

