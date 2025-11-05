"use client";

import { useState } from "react";
import RedditPostCard from "./RedditPostCard";

export default function RedditPostsContainer({ posts, query, mockData, error }) {
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible || !posts || posts.length === 0) {
    return null;
  }

  const closePosts = () => {
    setIsVisible(false);
  };

  return (
    <div className="reddit-posts-container">
      <div className="reddit-posts-header">
        <h3>🔍 Reddit Search Results</h3>
        <div className="reddit-posts-info">
          <span className="reddit-subreddit">r/vit</span>
          <span className="reddit-query">"{query}"</span>
          <span className="reddit-count">{posts.length} posts</span>
          {mockData && <span className="reddit-mock-indicator">📝 Mock Data</span>}
        </div>
        <button className="reddit-posts-close" onClick={closePosts} title="Close">
          ✕
        </button>
      </div>

      {error && (
        <div className="reddit-error-notice">
          <p>⚠️ {error}</p>
        </div>
      )}

      <div className="reddit-posts-list">
        {posts.map((post, index) => (
          <div key={post.id} className="reddit-post-item">
            <RedditPostCard
              post={post}
              index={index}
              totalPosts={posts.length}
              onClose={closePosts}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
