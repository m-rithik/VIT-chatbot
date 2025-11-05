// Reddit search utility functions

export async function searchReddit(query) {
  try {
    const response = await fetch('/api/reddit/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Reddit search error:', error);
    return {
      posts: [],
      error: error.message,
      query,
      subreddit: 'vit',
      totalResults: 0
    };
  }
}

export function formatRedditResponse(data) {
  if (!data.posts || data.posts.length === 0) {
    return `🔍 **Reddit Search Results**\n\nNo posts found for "${data.query}" in r/vit.`;
  }

  let response = `🔍 **Reddit Search Results for "${data.query}"**\n\n`;
  
  if (data.mockData) {
    response += `⚠️ **Note:** Reddit API is temporarily unavailable. Showing mock data for demonstration.\n\n`;
  }
  
  response += `Found ${data.totalResults} posts in r/vit:\n\n`;

  data.posts.forEach((post, index) => {
    response += `${index + 1}. **${post.title}**\n`;
    response += `   👤 Author: u/${post.author}\n`;
    response += `   ⬆ Score: ${post.score} | 💬 Comments: ${post.numComments}\n`;
    response += `   📅 Posted: ${post.created}\n`;
    if (post.selftext) {
      response += `   📝 Preview: ${post.selftext}\n`;
    }
    response += `   🔗 [View Post](${post.url})\n\n`;
  });

  return response;
}

export function detectRedditIntent(query) {
  const redditKeywords = [
    'reddit', 'r/vit', 'vit reddit', 'vit subreddit',
    'vit community', 'vit discussion', 'vit posts'
  ];
  
  const queryLower = query.toLowerCase();
  return redditKeywords.some(keyword => queryLower.includes(keyword));
}
