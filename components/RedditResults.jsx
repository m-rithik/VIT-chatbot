"use client";

import { useState, useEffect } from "react";

export default function RedditResults({ posts, query, isVisible, onClose, mockData, error }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (isVisible && posts.length > 0) {
      setCurrentIndex(0);
    }
  }, [isVisible, posts]);

  const nextPost = () => {
    if (isAnimating) return;
    setIsAnimating(true);
    setCurrentIndex((prev) => (prev + 1) % posts.length);
    setTimeout(() => setIsAnimating(false), 300);
  };

  const prevPost = () => {
    if (isAnimating) return;
    setIsAnimating(true);
    setCurrentIndex((prev) => (prev - 1 + posts.length) % posts.length);
    setTimeout(() => setIsAnimating(false), 300);
  };

  const openPost = (url) => {
    window.open(url, '_blank', 'width=800,height=600,scrollbars=yes,resizable=yes');
  };

  if (!isVisible || !posts || posts.length === 0) {
    return null;
  }

  const currentPost = posts[currentIndex];

  return (
    <div className="reddit-results-overlay">
      <div className="reddit-results-container">
        <div className="reddit-results-header">
          <h3>🔍 Reddit Search Results</h3>
          <div className="reddit-results-info">
            <span className="reddit-subreddit">r/vit</span>
            <span className="reddit-query">"{query}"</span>
            <span className="reddit-count">{currentIndex + 1} of {posts.length}</span>
            {mockData && <span className="reddit-mock-indicator">📝 Mock Data</span>}
          </div>
          <button className="reddit-close" onClick={onClose} title="Close">
            ✕
          </button>
        </div>

        {error && (
          <div className="reddit-error-notice">
            <p>⚠️ {error}</p>
          </div>
        )}

        <div className="reddit-results-content">
          <div className={`reddit-post-card ${isAnimating ? 'animating' : ''}`}>
            <div className="reddit-post-header">
              <div className="reddit-post-meta">
                <span className="reddit-author">u/{currentPost.author}</span>
                <span className="reddit-date">{currentPost.created}</span>
              </div>
              <div className="reddit-post-stats">
                <span className="reddit-score">⬆ {currentPost.score}</span>
                <span className="reddit-comments">💬 {currentPost.numComments}</span>
              </div>
            </div>
            
            <h4 className="reddit-post-title">{currentPost.title}</h4>
            
            {currentPost.selftext && (
              <p className="reddit-post-text">{currentPost.selftext}</p>
            )}
            
            {currentPost.thumbnail && (
              <div className="reddit-post-thumbnail">
                <img src={currentPost.thumbnail} alt="Post thumbnail" />
              </div>
            )}
            
            <div className="reddit-post-actions">
              <button 
                className="reddit-view-post"
                onClick={() => openPost(currentPost.url)}
              >
                View on Reddit
              </button>
            </div>
          </div>
        </div>

        <div className="reddit-navigation">
          <button 
            className="reddit-nav-btn prev"
            onClick={prevPost}
            disabled={isAnimating}
          >
            ← Previous
          </button>
          
          <div className="reddit-dots">
            {posts.map((_, index) => (
              <button
                key={index}
                className={`reddit-dot ${index === currentIndex ? 'active' : ''}`}
                onClick={() => {
                  if (!isAnimating) {
                    setIsAnimating(true);
                    setCurrentIndex(index);
                    setTimeout(() => setIsAnimating(false), 300);
                  }
                }}
              />
            ))}
          </div>
          
          <button 
            className="reddit-nav-btn next"
            onClick={nextPost}
            disabled={isAnimating}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
