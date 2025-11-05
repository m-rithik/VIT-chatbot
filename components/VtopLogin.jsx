"use client";

import { useState, useEffect } from "react";

export default function VtopLogin() {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [captchaImage, setCaptchaImage] = useState(null);
  const [vtopUsername, setVtopUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [lastAttemptTime, setLastAttemptTime] = useState(0);

  // Check for existing session on mount
  useEffect(() => {
    checkSession();
    
    // Also check localStorage for persisted session
    const stored = localStorage.getItem("vtopSession");
    if (stored) {
      try {
        const data = JSON.parse(stored);
        setIsLoggedIn(true);
        setVtopUsername(data.username);
      } catch (e) {
        localStorage.removeItem("vtopSession");
      }
    }
  }, []);

  async function checkSession() {
    try {
      const res = await fetch("/api/vtop/login", {
        method: "GET",
        credentials: "include",
      });
      const data = await res.json();
      if (data.valid) {
        setIsLoggedIn(true);
        setVtopUsername(data.username);
        
        // Store in localStorage
        localStorage.setItem("vtopSession", JSON.stringify({
          username: data.username,
          timestamp: data.timestamp,
        }));
      }
    } catch (err) {
      console.error("Session check failed:", err);
    }
  }

  async function refreshCaptcha() {
    setLoading(true);
    setError("");
    setMessage("Fetching new captcha...");
    setCaptcha("");

    try {
      // Make a dummy login request to get new captcha
      const res = await fetch("/api/vtop/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          username: username || "TEMP",
          password: "temp",
        }),
      });

      const data = await res.json();
      if (data.requiresCaptcha) {
        setCaptchaImage(data.captchaImage);
        setMessage("New captcha loaded");
        setTimeout(() => setMessage(""), 2000);
      }
    } catch (err) {
      setError("Failed to load captcha");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    
    // Prevent rapid successive attempts (cooldown period)
    const now = Date.now();
    const timeSinceLastAttempt = now - lastAttemptTime;
    const cooldownPeriod = 3000; // 3 seconds between attempts
    
    if (timeSinceLastAttempt < cooldownPeriod) {
      const remainingTime = Math.ceil((cooldownPeriod - timeSinceLastAttempt) / 1000);
      setError(`Please wait ${remainingTime} seconds before trying again`);
      return;
    }
    
    setLastAttemptTime(now);
    setError("");
    setMessage("");
    setLoading(true);

    // Add a small delay to prevent rapid submissions and rate limiting
    setMessage("Connecting to VTOP...");
    await new Promise(resolve => setTimeout(resolve, 1500));

    try {
      setMessage("Authenticating...");
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      const res = await fetch("/api/vtop/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        signal: controller.signal,
        body: JSON.stringify({
          username,
          password,
          captcha: captcha || undefined,
        }),
      });

      clearTimeout(timeoutId);

      const data = await res.json();

      if (data.requiresCaptcha) {
        setCaptchaImage(data.captchaImage);
        setMessage("Please solve the captcha to continue");
        setLoading(false);
        return;
      }

      if (!res.ok) {
        const errorMsg = data.error || "Login failed";
        setError(errorMsg);
        
        // Log to console for debugging
        console.error("VTOP Login Failed:", {
          status: res.status,
          error: errorMsg,
          requiresRetry: data.requiresRetry
        });
        
        // If it's a retry situation, clear captcha and let user try again
        if (data.requiresRetry) {
          setCaptcha("");
          setCaptchaImage(null);
          setMessage("Fetching new captcha...");
          // Automatically retry to get new captcha
          setTimeout(() => {
            setMessage("");
          }, 1000);
        }
        setLoading(false);
        return;
      }

      if (data.success) {
        setIsLoggedIn(true);
        setVtopUsername(data.username);
        setMessage("Successfully logged in to VTOP!");
        
        // Store in localStorage
        localStorage.setItem("vtopSession", JSON.stringify({
          username: data.username,
          timestamp: data.timestamp,
        }));
        
        // Clear form
        setPassword("");
        setCaptcha("");
        setCaptchaImage(null);
        
        setTimeout(() => {
          setIsOpen(false);
          setMessage("");
        }, 2000);
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        setError("Connection timeout. VTOP server took too long to respond. Please try again.");
      } else {
        setError(err.message || "Connection error");
      }
      console.error("Login error:", err);
    } finally {
      setLoading(false);
      setMessage("");
    }
  }


  async function handleLogout() {
    setLoading(true);
    setError("");
    setMessage("");
    
    try {
      console.log("Starting VTOP logout...");
      
      const response = await fetch("/api/vtop/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "logout" }),
      });
      
      if (!response.ok) {
        throw new Error(`Logout request failed: ${response.status}`);
      }
      
      const result = await response.json();
      console.log("Logout response:", result);
      
      // Clear all state
      setIsLoggedIn(false);
      setVtopUsername("");
      setUsername("");
      setPassword("");
      setCaptcha("");
      setCaptchaImage(null);
      
      // Clear localStorage
      localStorage.removeItem("vtopSession");
      localStorage.removeItem("vtopUsername");
      
      // Clear any cached data
      try {
        // Clear any other VTOP-related localStorage items
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('vtop') || key.includes('session')) {
            localStorage.removeItem(key);
          }
        });
      } catch (e) {
        console.log("Error clearing localStorage:", e);
      }
      
      setMessage("✅ Successfully logged out from VTOP");
      setTimeout(() => setMessage(""), 3000);
      
      console.log("VTOP logout completed successfully");
      
    } catch (err) {
      console.error("Logout error:", err);
      setError(`Logout failed: ${err.message}`);
      
      // Even if logout fails, clear local state
      setIsLoggedIn(false);
      setVtopUsername("");
      setUsername("");
      setPassword("");
      setCaptcha("");
      setCaptchaImage(null);
      
      // Clear localStorage
      localStorage.removeItem("vtopSession");
      localStorage.removeItem("vtopUsername");
      
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="vtop-login-container">
      {!isOpen ? (
        <button
          className={`vtop-toggle-btn ${isLoggedIn ? 'logged-in' : ''}`}
          onClick={() => setIsOpen(true)}
          title={isLoggedIn ? `VTOP: ${vtopUsername}` : "VTOP Login"}
        >
          {isLoggedIn ? (
            <>
              <span className="vtop-status-indicator">●</span>
              <span className="vtop-label">VTOP</span>
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" fill="currentColor"/>
              </svg>
              <span className="vtop-label">VTOP Login</span>
            </>
          )}
        </button>
      ) : (
        <div className="vtop-panel">
          <div className="vtop-panel-header">
            <h3>VTOP {isLoggedIn ? 'Session' : 'Login'}</h3>
            <button
              className="vtop-close-btn"
              onClick={() => setIsOpen(false)}
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <div className="vtop-panel-body">
            {isLoggedIn ? (
              <div className="vtop-session-info">
                <div className="vtop-user-badge">
                  <span className="vtop-user-icon">👤</span>
                  <div>
                    <div className="vtop-user-name">{vtopUsername}</div>
                    <div className="vtop-status-text">
                      <span className="vtop-status-dot">●</span> Active Session
                    </div>
                  </div>
                </div>
                
                <p className="vtop-session-note">
                  You can now ask about your attendance, assignments, exams, and more!
                </p>

                <div className="vtop-actions">
                  <button
                    className="vtop-logout-btn"
                    onClick={handleLogout}
                    disabled={loading}
                  >
                    {loading ? "Logging out..." : "Logout"}
                  </button>
                </div>

              </div>
            ) : (
              <form onSubmit={handleLogin} className="vtop-login-form">
                <div className="vtop-form-group">
                  <label htmlFor="vtop-username">Username</label>
                  <input
                    id="vtop-username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toUpperCase())}
                    placeholder="e.g., 21BCE1234"
                    required
                    disabled={loading}
                    autoComplete="username"
                  />
                </div>

                <div className="vtop-form-group">
                  <label htmlFor="vtop-password">Password</label>
                  <input
                    id="vtop-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Your VTOP password"
                    required
                    disabled={loading}
                    autoComplete="current-password"
                  />
                </div>

                {captchaImage && (
                  <div className="vtop-form-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label>Captcha (6 characters)</label>
                      <button
                        type="button"
                        onClick={refreshCaptcha}
                        disabled={loading}
                        className="vtop-refresh-btn"
                        title="Get new captcha"
                      >
                        🔄 Refresh
                      </button>
                    </div>
                    <img
                      src={captchaImage}
                      alt="CAPTCHA"
                      className="vtop-captcha-image"
                    />
                    <input
                      type="text"
                      value={captcha}
                      onChange={(e) => setCaptcha(e.target.value.toUpperCase())}
                      placeholder="Enter 6-character captcha"
                      maxLength={6}
                      required
                      disabled={loading}
                      autoComplete="off"
                      style={{ textTransform: 'uppercase', letterSpacing: '2px' }}
                    />
                    <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)', margin: '4px 0 0 0' }}>
                      Tip: Enter all 6 uppercase characters shown above
                    </p>
                  </div>
                )}

                {error && <div className="vtop-error">{error}</div>}
                {message && <div className="vtop-message">{message}</div>}

                <button
                  type="submit"
                  className="vtop-submit-btn"
                  disabled={loading}
                >
                  {loading ? (
                    <span className="loading-text">
                      <span className="loading-spinner"></span>
                      {message || "Logging in..."}
                    </span>
                  ) : (
                    "Login to VTOP"
                  )}
                </button>

                <p className="vtop-note">
                  Your credentials are securely transmitted and stored only during your session.
                </p>
                
                {error && (
                  <div className="vtop-debug-note">
                    💡 Tip: Check your terminal/server logs for detailed debug information
                  </div>
                )}
              </form>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        .vtop-login-container {
          position: fixed;
          top: 20px;
          left: 20px;
          z-index: 1000;
        }

        .vtop-toggle-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 12px;
          color: white;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.3s ease;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        .vtop-toggle-btn:hover {
          background: rgba(255, 255, 255, 0.15);
          border-color: rgba(255, 255, 255, 0.3);
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.15);
        }

        .vtop-toggle-btn.logged-in {
          background: rgba(34, 197, 94, 0.2);
          border-color: rgba(34, 197, 94, 0.3);
        }

        .vtop-toggle-btn.logged-in:hover {
          background: rgba(34, 197, 94, 0.3);
        }

        .vtop-status-indicator {
          color: #22c55e;
          font-size: 12px;
          animation: pulse 2s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .vtop-label {
          font-weight: 600;
        }

        .vtop-panel {
          width: 360px;
          background: rgba(20, 20, 40, 0.95);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
          overflow: hidden;
        }

        .vtop-panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .vtop-panel-header h3 {
          margin: 0;
          color: white;
          font-size: 18px;
          font-weight: 600;
        }

        .vtop-close-btn {
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.6);
          font-size: 28px;
          cursor: pointer;
          padding: 0;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          transition: all 0.2s;
        }

        .vtop-close-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: white;
        }

        .vtop-panel-body {
          padding: 20px;
        }

        .vtop-login-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .vtop-form-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .vtop-form-group label {
          color: rgba(255, 255, 255, 0.8);
          font-size: 14px;
          font-weight: 500;
        }

        .vtop-form-group input {
          padding: 12px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          color: white;
          font-size: 14px;
          transition: all 0.2s;
        }

        .vtop-form-group input:focus {
          outline: none;
          border-color: rgba(99, 102, 241, 0.5);
          background: rgba(255, 255, 255, 0.08);
        }

        .vtop-form-group input::placeholder {
          color: rgba(255, 255, 255, 0.3);
        }

        .vtop-captcha-image {
          width: 100%;
          height: auto;
          border-radius: 8px;
          margin-bottom: 8px;
        }

        .vtop-submit-btn {
          padding: 12px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border: none;
          border-radius: 8px;
          color: white;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s;
        }

        .vtop-submit-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
        }

        .vtop-submit-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .vtop-error {
          padding: 12px;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 8px;
          color: #fca5a5;
          font-size: 13px;
        }

        .vtop-message {
          padding: 12px;
          background: rgba(34, 197, 94, 0.1);
          border: 1px solid rgba(34, 197, 94, 0.3);
          border-radius: 8px;
          color: #86efac;
          font-size: 13px;
        }

        .vtop-note {
          color: rgba(255, 255, 255, 0.4);
          font-size: 12px;
          text-align: center;
          margin: 0;
        }

        .vtop-session-info {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .vtop-user-badge {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px;
          background: rgba(34, 197, 94, 0.1);
          border: 1px solid rgba(34, 197, 94, 0.2);
          border-radius: 12px;
        }

        .vtop-user-icon {
          font-size: 32px;
        }

        .vtop-user-name {
          color: white;
          font-size: 16px;
          font-weight: 600;
        }

        .vtop-status-text {
          display: flex;
          align-items: center;
          gap: 6px;
          color: #22c55e;
          font-size: 13px;
        }

        .vtop-status-dot {
          font-size: 10px;
          animation: pulse 2s ease-in-out infinite;
        }

        .vtop-session-note {
          color: rgba(255, 255, 255, 0.6);
          font-size: 14px;
          text-align: center;
          margin: 0;
        }

        .vtop-logout-btn {
          padding: 12px;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 8px;
          color: #fca5a5;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .vtop-logout-btn:hover:not(:disabled) {
          background: rgba(239, 68, 68, 0.2);
          border-color: rgba(239, 68, 68, 0.4);
        }

        .vtop-logout-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .vtop-actions {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }



        .vtop-refresh-btn {
          background: rgba(99, 102, 241, 0.2);
          border: 1px solid rgba(99, 102, 241, 0.3);
          border-radius: 6px;
          color: #a5b4fc;
          font-size: 12px;
          padding: 4px 8px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .vtop-refresh-btn:hover:not(:disabled) {
          background: rgba(99, 102, 241, 0.3);
          border-color: rgba(99, 102, 241, 0.4);
        }

        .vtop-refresh-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .vtop-debug-note {
          padding: 8px;
          background: rgba(99, 102, 241, 0.1);
          border: 1px solid rgba(99, 102, 241, 0.2);
          border-radius: 6px;
          color: rgba(255, 255, 255, 0.6);
          font-size: 11px;
          text-align: center;
          margin-top: 8px;
        }

        .loading-text {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .loading-spinner {
          display: inline-block;
          width: 14px;
          height: 14px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

