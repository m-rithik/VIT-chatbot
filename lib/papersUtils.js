// Papers utility functions

export async function searchPapers(subject) {
  try {
    const response = await fetch('/api/papers/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ subject }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error searching papers:', error);
    throw error;
  }
}

export function formatPapersResponse(data) {
  if (!data.papers || data.papers.length === 0) {
    return `📚 **Papers Search Results**\n\nNo papers found for "${data.subject}".`;
  }

  let response = `📚 **Papers Search Results for "${data.subject}"**\n\n`;
  
  if (data.mockData) {
    response += `⚠️ **Note:** Papers API is temporarily unavailable. Showing mock data for demonstration.\n\n`;
  }
  
  response += `Found ${data.totalResults} papers:\n\n`;

  data.papers.forEach((paper, index) => {
    response += `${index + 1}. **${paper.title}**\n`;
    response += `   📖 Course: ${paper.courseCode}\n`;
    response += `   📝 Exam: ${paper.exam} | 🎯 Slot: ${paper.slot}\n`;
    response += `   📅 Date: ${paper.date} | 🎓 Semester: ${paper.semester}\n`;
    if (paper.hasAnswerKey) {
      response += `   ✅ Answer Key Available\n`;
    }
    response += `   🔗 [View Paper](${paper.url})\n\n`;
  });

  return response;
}

export function detectPapersIntent(query) {
  const lowerQuery = query.toLowerCase();
  
  // Keywords that suggest papers search
  const papersKeywords = [
    'papers', 'paper', 'question paper', 'exam paper', 'previous year',
    'past paper', 'sample paper', 'model paper', 'test paper',
    'cat1', 'cat2', 'fat', 'midterm', 'final', 'quiz'
  ];
  
  // Subject keywords
  const subjectKeywords = [
    'cloud computing', 'data structures', 'algorithms', 'database',
    'operating system', 'computer networks', 'software engineering',
    'machine learning', 'artificial intelligence', 'web development',
    'mobile development', 'cybersecurity', 'blockchain', 'iot'
  ];
  
  const hasPapersKeyword = papersKeywords.some(keyword => lowerQuery.includes(keyword));
  const hasSubjectKeyword = subjectKeywords.some(keyword => lowerQuery.includes(keyword));
  
  // Check for specific patterns
  const papersPatterns = [
    /papers?\s+(for|of|in)\s+/i,
    /(previous|past|sample|model)\s+papers?/i,
    /(cat1|cat2|fat)\s+papers?/i,
    /exam\s+papers?/i,
    /question\s+papers?/i
  ];
  
  const hasPapersPattern = papersPatterns.some(pattern => pattern.test(query));
  
  return hasPapersKeyword || hasSubjectKeyword || hasPapersPattern;
}

export function extractSubjectFromQuery(query) {
  const lowerQuery = query.toLowerCase();
  
  // Remove common papers-related words
  const cleanedQuery = lowerQuery
    .replace(/\b(papers?|paper|question\s+paper|exam\s+paper|previous\s+year|past\s+paper|sample\s+paper|model\s+paper|test\s+paper)\b/g, '')
    .replace(/\b(for|of|in|about)\b/g, '')
    .replace(/\b(cat1|cat2|fat|midterm|final|quiz)\b/g, '')
    .trim();
  
  // Enhanced subject mappings based on CodeChef's actual subject names
  const subjectMappings = {
    'cloud': 'Cloud Computing',
    'aws': 'Aws For Cloud Computing',
    'salesforce': 'Cloud Computing Using Salesforce',
    'ds': 'Data Structures',
    'algo': 'Algorithms',
    'dbms': 'Database Management System',
    'os': 'Operating System',
    'cn': 'Computer Networks',
    'se': 'Software Engineering',
    'ml': 'Machine Learning',
    'ai': 'Artificial Intelligence',
    'web': 'Web Development',
    'mobile': 'Mobile Development',
    'cyber': 'Cybersecurity',
    'blockchain': 'Blockchain',
    'iot': 'Internet of Things',
    'data structures': 'Data Structures',
    'algorithms': 'Algorithms',
    'database': 'Database Management System',
    'operating system': 'Operating System',
    'computer networks': 'Computer Networks',
    'software engineering': 'Software Engineering',
    'machine learning': 'Machine Learning',
    'artificial intelligence': 'Artificial Intelligence'
  };
  
  // Check for exact matches first
  for (const [key, value] of Object.entries(subjectMappings)) {
    if (cleanedQuery.includes(key)) {
      return value;
    }
  }
  
  // Special handling for cloud computing variations
  if (cleanedQuery.includes('cloud') || cleanedQuery.includes('aws')) {
    return 'Cloud Computing'; // This will match multiple CodeChef subjects
  }
  
  // Return cleaned query with proper capitalization
  return cleanedQuery
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
