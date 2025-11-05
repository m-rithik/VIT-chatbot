// Mess Menu Utilities for Chatbot Integration
// Fetches and parses mess menu from messit.vinnovateit.com
// Note: Website only provides today's menu, date selection is not functional

import { JSDOM } from 'jsdom';

// Try to import Puppeteer scraper (optional)
let scrapeMessMenu = null;

try {
  const scraper = await import('./messitScraper.js');
  scrapeMessMenu = scraper.scrapeMessMenu;
  console.log('✓ Puppeteer scraper loaded successfully');
} catch (error) {
  console.log('⚠ Puppeteer scraper not available, using sample data:', error.message);
}

// Session management for messit.vinnovateit.com
let messitSession = {
  cookies: new Map(),
  timestamp: null,
};

// Reset messit session
export function resetMessitSession() {
  messitSession = {
    cookies: new Map(),
    timestamp: null,
  };
  console.log('✓ Messit session reset');
}

// Get today's date in YYYY-MM-DD format
function getTodayDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Parse date from various formats
function parseDate(dateStr) {
  if (!dateStr) return getTodayDate();
  
  // If already in YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  
  // If it's just a day number (like "22"), use current month/year
  if (/^\d{1,2}$/.test(dateStr)) {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(parseInt(dateStr)).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  // Try to parse as a Date object
  const date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  return getTodayDate();
}

// Get day name from date
function getDayName(dateStr) {
  const date = new Date(dateStr);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[date.getDay()];
}

// Sample mess menu data (fallback when scraping fails)
const SAMPLE_MENUS = {
  'MH-Veg': {
    breakfast: ['Idli', 'Vada', 'Sambar', 'Coconut Chutney', 'Coffee/Tea'],
    lunch: ['Rice', 'Sambar', 'Rasam', 'Curd', 'Papad', 'Mixed Vegetable Curry'],
    snacks: ['Bhajji', 'Tea/Coffee'],
    dinner: ['Chapati', 'Dal', 'Vegetable Curry', 'Rice', 'Curd']
  },
  'MH-Non-Veg': {
    breakfast: ['Puri', 'Chana Masala', 'Coffee/Tea', 'Banana'],
    lunch: ['Rice', 'Sambar', 'Chicken Curry', 'Egg Masala', 'Curd', 'Papad'],
    snacks: ['Cutlet', 'Tea/Coffee'],
    dinner: ['Chapati', 'Fish Fry', 'Dal', 'Rice', 'Vegetable Curry']
  },
  'MH-Special': {
    breakfast: ['Special Breakfast - Pongal', 'Vadai', 'Sambar', 'Coconut Chutney', 'Coffee/Tea'],
    lunch: ['Special Biryani', 'Raita', 'Chicken 65', 'Gulab Jamun', 'Salad'],
    snacks: ['Special Samosa', 'Sauce', 'Tea/Coffee'],
    dinner: ['Special Pulao', 'Paneer Butter Masala', 'Naan', 'Raita', 'Ice Cream']
  },
  'LH-Veg': {
    breakfast: ['Dosa', 'Sambar', 'Coconut Chutney', 'Coffee/Tea'],
    lunch: ['Rice', 'Sambar', 'Rasam', 'Curd', 'Papad', 'Paneer Butter Masala'],
    snacks: ['Pav Bhaji', 'Tea/Coffee'],
    dinner: ['Chapati', 'Dal', 'Mix Veg', 'Rice', 'Curd']
  },
  'LH-Non-Veg': {
    breakfast: ['Upma', 'Chutney', 'Coffee/Tea', 'Boiled Egg'],
    lunch: ['Rice', 'Sambar', 'Chicken Biryani', 'Raita', 'Papad'],
    snacks: ['Egg Puff', 'Tea/Coffee'],
    dinner: ['Chapati', 'Chicken Curry', 'Dal', 'Rice', 'Curd']
  },
  'LH-Special': {
    breakfast: ['Special Breakfast - Poori', 'Aloo Curry', 'Fruit', 'Coffee/Tea'],
    lunch: ['Special Fried Rice', 'Manchurian', 'Soup', 'Dessert'],
    snacks: ['Special Pakora', 'Sweet', 'Tea/Coffee'],
    dinner: ['Special Roti', 'Dal Makhani', 'Paneer Tikka', 'Kheer']
  }
};

// Fetch and parse mess menu from messit.vinnovateit.com/details
export async function getMessMenu(hostelType = 'MH', messType = 'Non-Veg', selectedDate = null) {
  try {
    console.log('=== Fetching Mess Menu ===');
    console.log('Hostel Type:', hostelType);
    console.log('Mess Type:', messType);
    console.log('Selected Date:', selectedDate);

    // Use selected date or default to today
    const date = selectedDate ? parseDate(selectedDate) : getTodayDate();
    const dayName = getDayName(date);
    const dayNumber = new Date(date).getDate();
    
    console.log('Date:', date);
    console.log('Day Name:', dayName);
    console.log('Day Number:', dayNumber);

    let meals = null;
    let scrapedData = false;
    let availableDates = [];

    // Try to scrape real-time data with Puppeteer if available
    if (scrapeMessMenu) {
      try {
        console.log('→ Attempting to scrape real-time data with Puppeteer...');
        const scrapedResult = await scrapeMessMenu(hostelType, messType, dayNumber);
        meals = scrapedResult.meals;
        availableDates = scrapedResult.availableDates || [];
        scrapedData = true;
        console.log('✓ Real-time data scraped successfully');
      } catch (scrapeError) {
        console.warn('⚠ Puppeteer scraping failed, falling back to sample data:', scrapeError.message);
        meals = null;
      }
    }

    // Fallback to sample menu if scraping failed or unavailable
    if (!meals || (meals.breakfast.length === 0 && meals.lunch.length === 0 && meals.snacks.length === 0 && meals.dinner.length === 0)) {
      console.log('→ Using sample menu data');
      const menuKey = `${hostelType}-${messType}`;
      const sampleMenu = SAMPLE_MENUS[menuKey] || SAMPLE_MENUS['MH-Non-Veg'];
      meals = {
        breakfast: [...sampleMenu.breakfast],
        lunch: [...sampleMenu.lunch],
        snacks: [...sampleMenu.snacks],
        dinner: [...sampleMenu.dinner]
      };
      
      // Generate available dates for sample data
      if (availableDates.length === 0) {
        const today = new Date();
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();
        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        const todayDate = today.getDate();

        for (let day = 1; day <= daysInMonth; day++) {
          availableDates.push({
            dayNumber: day,
            isToday: day === todayDate,
            date: `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          });
        }
      }
    }

    console.log('Meals count:', {
      breakfast: meals.breakfast.length,
      lunch: meals.lunch.length,
      snacks: meals.snacks.length,
      dinner: meals.dinner.length
    });

    const today = new Date();
    const menu = {
      date,
      dayName,
      hostelType,
      messType,
      currentMonth: today.toLocaleString('default', { month: 'long' }),
      currentYear: today.getFullYear(),
      selectedDate: dayNumber,
      availableDates,
      isRealTime: scrapedData,
      meals
    };

    console.log('✓ Mess menu fetched successfully');
    console.log('Data source:', scrapedData ? 'Real-time (Puppeteer)' : 'Sample data');

    return menu;

  } catch (error) {
    console.error('Mess menu fetch error:', error);
    throw new Error(`Failed to fetch mess menu: ${error.message}`);
  }
}

// Get available hostel types and mess types
export async function getMessOptions() {
  try {
    console.log('=== Fetching Mess Options ===');

    // Return structured options for the frontend
    const options = {
      hostelTypes: [
        { value: 'MH', label: "Men's Hostel", name: "Men's Hostel" },
        { value: 'LH', label: "Ladies Hostel", name: "Ladies Hostel" }
      ],
      messTypes: [
        { value: 'Veg', label: 'Vegetarian', name: 'Vegetarian' },
        { value: 'Non-Veg', label: 'Non-Vegetarian', name: 'Non-Vegetarian' },
        { value: 'Special', label: 'Special', name: 'Special' }
      ],
      defaultHostel: 'MH',
      defaultMess: 'Non-Veg'
    };

    console.log('✓ Mess options prepared:', options);
    return options;

  } catch (error) {
    console.error('Mess options error:', error);
    // Return default options on error
    return {
      hostelTypes: [
        { value: 'MH', label: "Men's Hostel", name: "Men's Hostel" },
        { value: 'LH', label: "Ladies Hostel", name: "Ladies Hostel" }
      ],
      messTypes: [
        { value: 'Veg', label: 'Vegetarian', name: 'Vegetarian' },
        { value: 'Non-Veg', label: 'Non-Vegetarian', name: 'Non-Vegetarian' },
        { value: 'Special', label: 'Special', name: 'Special' }
      ],
      defaultHostel: 'MH',
      defaultMess: 'Non-Veg'
    };
  }
}

// Format mess menu for chat display
export function formatMessMenuForChat(menuData) {
  const { date, dayName, hostelType, messType, meals, isRealTime } = menuData;

  let content = `🍽️ **Today's Mess Menu - ${dayName}, ${date}**\n`;
  content += `📍 **Hostel:** ${hostelType === 'MH' ? "Men's Hostel" : "Ladies Hostel"}\n`;
  content += `🍴 **Mess Type:** ${messType}\n\n`;

  if (isRealTime) {
    content += `*(Real-time data from messit.vinnovateit.com)*\n\n`;
  }

  if (meals.breakfast.length > 0) {
    content += `🌅 **Breakfast:** ${meals.breakfast.join(', ')}\n\n`;
  }
  if (meals.lunch.length > 0) {
    content += `☀️ **Lunch:** ${meals.lunch.join(', ')}\n\n`;
  }
  if (meals.snacks.length > 0) {
    content += `🍪 **Snacks:** ${meals.snacks.join(', ')}\n\n`;
  }
  if (meals.dinner.length > 0) {
    content += `🌙 **Dinner:** ${meals.dinner.join(', ')}\n`;
  }

  if (meals.breakfast.length === 0 && meals.lunch.length === 0 && meals.snacks.length === 0 && meals.dinner.length === 0) {
    content += `📝 **Menu information is currently unavailable.**\n`;
    content += `Please try again later or select a different mess type.\n`;
  }

  return content;
}

// Format mess options for chat display
export function formatMessOptionsForChat(options) {
  const { hostelTypes, messTypes, defaultHostel, defaultMess } = options;
  
  let response = "🍽️ **Available Mess Options**\n\n";
  response += `**Hostel Types**: ${hostelTypes.map(h => h.label).join(', ')}\n`;
  response += `**Mess Types**: ${messTypes.map(m => m.label).join(', ')}\n\n`;
  response += `📌 Default: ${hostelTypes.find(h => h.value === defaultHostel)?.label} - ${messTypes.find(m => m.value === defaultMess)?.label}\n\n`;
  response += "💡 *Ask me: 'What's for lunch today?' or 'Show today's mess menu'*";
  
  return response;
}

// Clear mess cache
export function clearMessCache() {
  resetMessitSession();
  console.log('✓ Mess cache cleared');
}

// Detect mess-related intent from user query
export function detectMessIntent(query) {
  const lowerQuery = query.toLowerCase();
  
  const messKeywords = [
    'mess', 'menu', 'food', 'breakfast', 'lunch', 'dinner', 'snacks',
    'eat', 'eating', 'meal', 'meals', 'hostel food', 'canteen'
  ];
  
  const hasMessKeyword = messKeywords.some(keyword => lowerQuery.includes(keyword));
  
  if (hasMessKeyword) {
    return 'mess_menu';
  }
  
  return null;
}
