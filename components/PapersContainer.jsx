import { useState } from 'react';
import PaperCard from './PaperCard';

export default function PapersContainer({ papers, subject, mockData, error }) {
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible || !papers || papers.length === 0) {
    return null;
  }

  const closePapers = () => {
    setIsVisible(false);
  };

  return (
    <div className="papers-container">
      <div className="papers-header">
        <h3>📚 Papers Search Results</h3>
        <div className="papers-info">
          <span className="papers-subject">Search: {subject}</span>
          <span className="papers-count">{papers.length} papers</span>
          {mockData && <span className="papers-mock-indicator">📝 Mock Data</span>}
        </div>
        <button className="papers-close" onClick={closePapers} title="Close">
          ✕
        </button>
      </div>

      {error && (
        <div className="papers-error-notice">
          <p>⚠️ {error}</p>
        </div>
      )}

      <div className="papers-list">
        {papers.map((paper, index) => (
          <div key={paper.id} className="paper-item">
            <PaperCard
              paper={paper}
              index={index}
              totalPapers={papers.length}
              onClose={closePapers}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
