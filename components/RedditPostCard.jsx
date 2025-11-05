"use client";

import { useState } from "react";

export default function RedditPostCard({ post, index, totalPosts, onClose }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const openPost = (url) => {
    window.open(url, '_blank', 'width=800,height=600,scrollbars=yes,resizable=yes');
  };

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div className="reddit-post-card-inline">
      <div className="reddit-card-header">
        <div className="reddit-card-meta">
          <span className="reddit-card-author">u/{post.author}</span>
          <span className="reddit-card-date">{post.created}</span>
        </div>
        <div className="reddit-card-stats">
          <span className="reddit-card-score">⬆ {post.score}</span>
          <span className="reddit-card-comments">💬 {post.numComments}</span>
        </div>
        <div className="reddit-card-actions">
          <button 
            className="reddit-card-expand"
            onClick={toggleExpanded}
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? "−" : "+"}
          </button>
          <button 
            className="reddit-card-close"
            onClick={onClose}
            title="Close"
          >
            ✕
          </button>
        </div>
      </div>

      <h4 className="reddit-card-title">{post.title}</h4>
      
      {post.selftext && (
        <div className={`reddit-card-text ${isExpanded ? 'expanded' : 'collapsed'}`}>
          <p>{post.selftext}</p>
        </div>
      )}
      
      {post.thumbnail && (
        <div className="reddit-card-thumbnail">
          <img src={post.thumbnail} alt="Post thumbnail" />
        </div>
      )}
      
      <div className="reddit-card-footer">
        <button 
          className="reddit-card-view-btn"
          onClick={() => openPost(post.url)}
        >
          View on Reddit
        </button>
        
        <div className="reddit-card-counter">
          Post {index + 1} of {totalPosts}
        </div>
      </div>
    </div>
  );
}
