import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const { query } = await req.json();
    
    if (!query || query.trim().length === 0) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    // Use Reddit's public JSON API with proper headers - specifically search r/vit
    const redditUrl = `https://www.reddit.com/r/vit/search.json?q=${encodeURIComponent(query)}&sort=relevance&limit=10&raw_json=1&t=all&restrict_sr=1`;
    
    const response = await fetch(redditUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'cross-site',
        'Referer': 'https://www.reddit.com/',
        'Origin': 'https://www.reddit.com'
      },
      // Add timeout and retry logic
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });

    if (!response.ok) {
      console.error(`Reddit API error: ${response.status} - ${response.statusText}`);
      
      // Return mock data for development/testing
      return NextResponse.json({
        posts: [
          {
            id: 'mock1',
            title: `Mock Post: ${query} discussion`,
            author: 'vit_student',
            score: 15,
            numComments: 8,
            created: new Date().toLocaleDateString(),
            url: 'https://reddit.com/r/vit/comments/mock1',
            thumbnail: null,
            selftext: `This is a mock post about ${query} for testing purposes.`,
            subreddit: 'vit',
            index: 1
          },
          {
            id: 'mock2',
            title: `Another ${query} related post`,
            author: 'vit_alumni',
            score: 23,
            numComments: 12,
            created: new Date().toLocaleDateString(),
            url: 'https://reddit.com/r/vit/comments/mock2',
            thumbnail: null,
            selftext: `Mock discussion about ${query} in VIT context.`,
            subreddit: 'vit',
            index: 2
          }
        ],
        query,
        subreddit: 'vit',
        totalResults: 2,
        mockData: true,
        error: `Reddit API temporarily unavailable (${response.status}). Showing mock data.`
      });
    }

    const data = await response.json();
    
    if (!data.data || !data.data.children) {
      return NextResponse.json({ 
        posts: [],
        query,
        subreddit: 'vit',
        totalResults: 0,
        error: 'No posts found'
      });
    }

    // Format the posts for our UI
    const posts = data.data.children.map((post, index) => {
      const postData = post.data;
      return {
        id: postData.id,
        title: postData.title,
        author: postData.author,
        score: postData.score,
        numComments: postData.num_comments,
        created: new Date(postData.created_utc * 1000).toLocaleDateString(),
        url: `https://reddit.com${postData.permalink}`,
        thumbnail: postData.thumbnail && postData.thumbnail !== 'self' && postData.thumbnail !== 'default' ? postData.thumbnail : null,
        selftext: postData.selftext ? postData.selftext.substring(0, 200) + '...' : null,
        subreddit: postData.subreddit,
        index: index + 1
      };
    });

    return NextResponse.json({ 
      posts,
      query,
      subreddit: 'vit',
      totalResults: posts.length,
      mockData: false
    });

  } catch (error) {
    console.error('Reddit search error:', error);
    
    // Return mock data on error
    const { query } = await req.json().catch(() => ({ query: 'test' }));
    
    return NextResponse.json({
      posts: [
        {
          id: 'error1',
          title: `Error Fallback: ${query} discussion`,
          author: 'vit_community',
          score: 5,
          numComments: 3,
          created: new Date().toLocaleDateString(),
          url: 'https://reddit.com/r/vit',
          thumbnail: null,
          selftext: `Unable to fetch real Reddit data. This is a fallback post about ${query}.`,
          subreddit: 'vit',
          index: 1
        }
      ],
      query: query || 'test',
      subreddit: 'vit',
      totalResults: 1,
      mockData: true,
      error: 'Reddit API error - showing fallback data'
    });
  }
}
