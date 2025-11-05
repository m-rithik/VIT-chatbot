import { useState } from 'react';

export default function PaperCard({ paper, index, totalPapers, onClose }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const openPaper = (url) => {
    // Ensure the URL is properly formatted
    const fullUrl = url.startsWith('http') ? url : `https://papers.codechefvit.com${url}`;
    console.log('Opening paper:', fullUrl);
    window.open(fullUrl, '_blank', 'width=1200,height=800,scrollbars=yes,resizable=yes');
  };

  return (
    <div className="paper-card-inline">
      <div className="paper-card-header">
        <div className="paper-card-meta">
          <span className="paper-card-course">{paper.courseCode || 'N/A'}</span>
          <span>•</span>
          <span className="paper-card-exam">{paper.exam || 'N/A'}</span>
        </div>
        <div className="paper-card-stats">
          {paper.slot && <span className="paper-card-slot">🎯 {paper.slot}</span>}
          {paper.hasAnswerKey && (
            <span className="paper-card-answer-key">✅ Answer Key</span>
          )}
        </div>
      </div>
      
      <h4 className="paper-card-title">{paper.title || 'Untitled Paper'}</h4>
      
      <div className="paper-card-details">
        <div className="paper-card-detail-item">
          <span className="paper-card-label">📅 Date:</span>
          <span className="paper-card-value">{paper.date || 'N/A'}</span>
        </div>
        <div className="paper-card-detail-item">
          <span className="paper-card-label">🎓 Semester:</span>
          <span className="paper-card-value">{paper.semester || 'N/A'}</span>
        </div>
      </div>
      
      {paper.thumbnail && (
        <div className="paper-card-thumbnail">
          <img src={paper.thumbnail} alt="Paper thumbnail" />
        </div>
      )}
      
      <div className="paper-card-footer">
        <button 
          className="paper-card-view-btn"
          onClick={() => openPaper(paper.url)}
        >
          View Paper
        </button>
        
        <div className="paper-card-counter">
          Paper {index + 1} of {totalPapers}
        </div>
      </div>
    </div>
  );
}
