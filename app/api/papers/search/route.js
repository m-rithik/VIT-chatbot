import { NextResponse } from 'next/server';
import puppeteer from 'puppeteer';

export async function POST(req) {
  try {
    const { subject } = await req.json();
    
    if (!subject || subject.trim().length === 0) {
      return NextResponse.json({ error: 'Subject is required' }, { status: 400 });
    }

    // Construct the URL for CodeChef-VIT Papers API
    // Replace spaces with %20 and use the exact subject name
    const encodedSubject = subject.replace(/\s+/g, '%20');
    const papersUrl = `https://papers.codechefvit.com/catalogue?subject=${encodedSubject}`;
    console.log('Fetching papers from URL:', papersUrl);

    // Launch Puppeteer browser
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu'
      ]
    });

    try {
      const page = await browser.newPage();
      
      // Set user agent to avoid detection
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      // Set viewport
      await page.setViewport({ width: 1280, height: 720 });
      
      console.log('Navigating to:', papersUrl);
      await page.goto(papersUrl, { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });

      // Wait for paper cards to load (or timeout)
      console.log('Waiting for paper cards to load...');
      try {
        await page.waitForSelector('.overflow-hidden.rounded-sm.border-2', { timeout: 15000 });
        console.log('Paper cards found!');
      } catch (waitError) {
        console.log('No paper cards found within timeout, checking for any content...');
      }

      // Extract paper data using Puppeteer
      const papers = await page.evaluate((userSubject) => {
        const paperCards = document.querySelectorAll('.overflow-hidden.rounded-sm.border-2');
        const extractedPapers = [];

        paperCards.forEach((card, index) => {
          try {
            // Extract paper link
            const linkElement = card.querySelector('a[href*="/paper/"]');
            if (!linkElement) return;

            const url = linkElement.getAttribute('href');
            const fullUrl = url.startsWith('http') ? url : `https://papers.codechefvit.com${url}`;

            // Extract title
            const titleElement = card.querySelector('.font-play.text-lg.font-semibold');
            const title = titleElement ? titleElement.textContent.trim() : 'Untitled Paper';

            // Extract course code
            const courseElement = card.querySelector('.text-md.font-play.font-medium');
            const courseCode = courseElement ? courseElement.textContent.trim() : 'N/A';

            // Extract tags (exam, slot, date, semester)
            const tagElements = card.querySelectorAll('.rounded-sm.bg-\\[\\#B2B8FF\\]');
            const tags = Array.from(tagElements).map(tag => tag.textContent.trim());

            // Check for answer key
            const answerKeyElement = card.querySelector('.lucide-check');
            const hasAnswerKey = answerKeyElement !== null;

            // Extract paper ID from URL
            const paperId = url.split('/').pop();

            extractedPapers.push({
              id: `real_paper_${paperId}`,
              title: title,
              subject: title, // Use title as subject
              exam: tags[0] || 'N/A',
              date: tags[2] || 'N/A',
              semester: tags[3] || 'N/A',
              slot: tags[1] || 'N/A',
              courseCode: courseCode,
              thumbnail: null,
              url: fullUrl,
              hasAnswerKey: hasAnswerKey,
              index: index + 1
            });

            console.log(`Extracted paper ${index + 1}: ${title} (${courseCode}) - ${tags.join(', ')}`);
          } catch (error) {
            console.error(`Error extracting paper ${index + 1}:`, error);
          }
        });

        return extractedPapers;
      }, subject);

      console.log(`Extracted ${papers.length} papers using Puppeteer`);

      await browser.close();

      if (papers.length === 0) {
        return NextResponse.json({
          papers: [],
          subject,
          totalResults: 0,
          mockData: false,
          error: 'No papers found for this subject.',
          directLink: papersUrl,
          note: 'No papers were found on the CodeChef Papers website for this subject.'
        });
      }

      return NextResponse.json({
        papers: papers,
        subject,
        totalResults: papers.length,
        mockData: false
      });

    } catch (puppeteerError) {
      console.error('Puppeteer error:', puppeteerError);
      await browser.close();
      
      return NextResponse.json({ 
        papers: [],
        subject,
        totalResults: 0,
        mockData: false,
        error: 'Failed to scrape papers using browser automation.',
        directLink: papersUrl,
        note: 'There was an error accessing the CodeChef Papers website. Please try visiting the website directly.'
      });
    }

  } catch (error) {
    console.error('Papers search error:', error);
    
    // Return empty results on error
    return NextResponse.json({
      papers: [],
      subject: subject || 'Unknown',
      totalResults: 0,
      mockData: false,
      error: 'Failed to fetch papers from CodeChef website.',
      directLink: `https://papers.codechefvit.com/catalogue?subject=${encodeURIComponent(subject || '')}`,
      note: 'Please try visiting the CodeChef Papers website directly to search for papers.'
    });
  }
}

