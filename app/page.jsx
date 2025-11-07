"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton,
  UserButton,
  useUser,
} from "@clerk/nextjs";
import VtopLogin from "../components/VtopLogin";
import RedditToggle from "../components/RedditToggle";
import RedditPostsContainer from "../components/RedditPostsContainer";
import { searchReddit, formatRedditResponse, detectRedditIntent } from "../lib/redditUtils";
import PapersContainer from "../components/PapersContainer";
import { searchPapers, formatPapersResponse, detectPapersIntent, extractSubjectFromQuery } from "../lib/papersUtils";

const QUICK_ACTIONS = [
  { label: "Faculty", fill: "Who is devipriya a ma'am" },
  { label: "Clubs", fill: "What's csed club?" },
  { label: "Exams", fill: "List upcoming exams and dates" },
  { label: "Assignments", fill: "Any assignments due this week?" },
  { label: "Course Materials", fill: "Provide my course materials for DSA" },
  { label: "Mess Menu", fill: "Show me today's mess menu" },
  { label: "Club Events", fill: "Show club events happening this weekend" },
  { label: "Fees", fill: "Fees due and last payment date" },
  { label: "My Attendance", fill: "Show my attendance" },
  { label: "My Assignments", fill: "Show my digital assignments" },
];

const BOT_NAME = "VIT Bot";

export default function HomePage() {
  const { isSignedIn } = useUser();

  useEffect(() => {
    const className = "body--landing";
    const body = document.body;
    if (!isSignedIn) {
      body.classList.add(className);
    } else {
      body.classList.remove(className);
    }
    return () => body.classList.remove(className);
  }, [isSignedIn]);

  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState([]);
  const [activeTab, setActiveTab] = useState("chat");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");
  const [showSemesterDropdown, setShowSemesterDropdown] = useState(false);
  const [availableSemesters, setAvailableSemesters] = useState([]);
  const [selectedSemester, setSelectedSemester] = useState(null);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [courseDetails, setCourseDetails] = useState(null);
  const [courseDetailsLoading, setCourseDetailsLoading] = useState(false);
  const [facultySearchLoading, setFacultySearchLoading] = useState(false);
  const [selectedFaculty, setSelectedFaculty] = useState(null);
  const [redditSearchEnabled, setRedditSearchEnabled] = useState(false);
  const [redditSearching, setRedditSearching] = useState(false);
  const [papersSearching, setPapersSearching] = useState(false);
  const [facultyDetails, setFacultyDetails] = useState(null);
  const [facultyDetailsLoading, setFacultyDetailsLoading] = useState(false);
  const [messOptionsLoading, setMessOptionsLoading] = useState(false);
  const [messOptions, setMessOptions] = useState(null);
  const [selectedHostelType, setSelectedHostelType] = useState(null);
  const [selectedMessType, setSelectedMessType] = useState(null);
  const [messMenuLoading, setMessMenuLoading] = useState(false);
  const [messMenu, setMessMenu] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const inputRef = useRef(null);

  // Function to reset mess menu state
  const resetMessMenuState = () => {
    setMessOptions(null);
    setSelectedHostelType(null);
    setSelectedMessType(null);
    setMessMenu(null);
    setSelectedDate(null);
    setMessOptionsLoading(false);
    setMessMenuLoading(false);
  };

  // Function to reset messit session
  const resetMessitSession = async () => {
    try {
      await fetch('/api/mess', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      console.log('Messit session reset successfully');
    } catch (error) {
      console.error('Error resetting messit session:', error);
    }
  };

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(""), 1500);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const heroSubtitle = useMemo(
    () =>
      loading
        ? "Hang tight while I pull that up for you."
        : "Pick a quick action or just ask me anything about campus life. I am listening.",
    [loading]
  );

  async function fetchDigitalAssignments(semesterLabel = null) {
    setAssignmentsLoading(true);
    
    try {
      const url = semesterLabel ? "/api/vtop/assignments" : "/api/vtop/assignments";
      const method = semesterLabel ? "POST" : "GET";
      const body = semesterLabel ? JSON.stringify({ semesterLabel }) : undefined;
      
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body,
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch assignments");
      }
      
      if (data.success) {
        console.log('Received assignments data:', data);
        console.log('Assignments:', data.assignments);
        
        setAvailableSemesters(data.semesters || []);
        setSelectedSemester(data.semester);
        
        // Add assignments to messages
        const assignmentsContent = data.assignments.length > 0 
          ? formatAssignmentsForChat(data.assignments, data.semester)
          : "No assignments found for this semester.";
          
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: assignmentsContent,
            assignments: data.assignments,
            semester: data.semester,
            semesters: data.semesters,
            showSemesterDropdown: data.semesters && data.semesters.length > 1 && data.semester?.label !== 'Fall Semester 2025-26',
          },
        ]);
        
        setShowSemesterDropdown(data.semesters && data.semesters.length > 1 && data.semester?.label !== 'Fall Semester 2025-26');
      }
    } catch (err) {
      setMessages((prev) => [...prev, { 
        role: "assistant", 
        content: `Failed to fetch assignments: ${err.message}` 
      }]);
    } finally {
      setAssignmentsLoading(false);
    }
  }

  function formatAssignmentsForChat(assignments, semester) {
    let content = `📝 **Digital Assignments**\n\n`;
    
    if (assignments.length === 0) {
      return content + "No assignments found for this semester.";
    }
    
    content += `Found ${assignments.length} courses with assignments:\n\n`;
    
    assignments.forEach((assignment, index) => {
      content += `${index + 1}. **${assignment.courseCode}** - ${assignment.courseTitle}\n`;
      content += `   📚 Type: ${assignment.courseType || 'Not specified'}\n`;
      content += `   👨‍🏫 Faculty: ${assignment.facultyName || 'Not specified'}\n\n`;
    });
    
    return content;
  }

  async function fetchCourseDetails(classId) {
    setCourseDetailsLoading(true);
    
    try {
      const res = await fetch("/api/vtop/assignment-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ classId }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch course details");
      }
      
      if (data.success) {
        setCourseDetails(data);
        
        // Add course details to messages
        const detailsContent = formatCourseDetailsForChat(data);
        
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: detailsContent,
            courseDetails: data,
            showCourseDetails: true,
          },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [...prev, { 
        role: "assistant", 
        content: `Failed to fetch course details: ${err.message}` 
      }]);
    } finally {
      setCourseDetailsLoading(false);
    }
  }

  function formatCourseDetailsForChat(details) {
    if (!details.courseInfo || !details.assignments) {
      return "No course details found.";
    }
    
    let content = `📚 **Course Details - ${details.courseInfo.courseCode}**\n`;
    content += `**${details.courseInfo.courseTitle}**\n`;
    content += `📋 Type: ${details.courseInfo.courseType}\n`;
    content += `🏫 Class: ${details.courseInfo.classNumber}\n\n`;
    
    if (details.assignments.length === 0) {
      content += "No assignments found for this course.";
    } else {
      content += `**Assignments (${details.assignments.length}):**\n\n`;
      details.assignments.forEach((assignment, index) => {
        content += `${index + 1}. **${assignment.title}**\n`;
        content += `   📅 Due: ${assignment.dueDate}\n`;
        content += `   📊 Max Marks: ${assignment.maxMark}\n`;
        content += `   ⚖️ Weightage: ${assignment.weightage}\n`;
        content += `   📝 Last Updated: ${assignment.lastUpdated}\n\n`;
      });
    }
    
    return content;
  }

  async function fetchFacultySearch(searchQuery) {
    setFacultySearchLoading(true);
    
    try {
      const res = await fetch("/api/vtop/faculty-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ searchQuery }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Failed to search faculty");
      }
      
      if (data.success) {
        console.log('Received faculty search data:', data);
        
        // Add faculty search results to messages
        const facultyContent = data.results.length > 0 
          ? formatFacultySearchForChat(data.results, data.searchQuery)
          : `No faculty found matching "${data.searchQuery}". Please try a different search term.`;
          
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: facultyContent,
            facultyResults: data.results,
            searchQuery: data.searchQuery,
            showFacultyDropdown: data.results.length > 0,
          },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [...prev, { 
        role: "assistant", 
        content: `Failed to search faculty: ${err.message}` 
      }]);
    } finally {
      setFacultySearchLoading(false);
    }
  }

  function formatFacultySearchForChat(facultyResults, searchQuery) {
    let content = `👨‍🏫 **Faculty Search Results**\n\n`;
    content += `Search query: "${searchQuery}"\n`;
    content += `Found ${facultyResults.length} faculty member(s):\n\n`;
    
    facultyResults.forEach((faculty, index) => {
      content += `${index + 1}. **${faculty.name}**\n`;
      content += `   📋 Designation: ${faculty.designation || 'Not specified'}\n`;
      content += `   🏫 School: ${faculty.school || 'Not specified'}\n`;
      content += `   🆔 Employee ID: ${faculty.employeeId}\n\n`;
    });
    
    return content;
  }

  async function fetchFacultyDetails(employeeId) {
    setFacultyDetailsLoading(true);
    
    try {
      const res = await fetch("/api/vtop/faculty-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ employeeId }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch faculty details");
      }
      
      if (data.success) {
        setFacultyDetails(data);
        
        // Add faculty details to messages
        const detailsContent = formatFacultyDetailsForChat(data);
        
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: detailsContent,
            facultyDetails: data,
            showFacultyDetails: true,
          },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [...prev, { 
        role: "assistant", 
        content: `Failed to fetch faculty details: ${err.message}` 
      }]);
    } finally {
      setFacultyDetailsLoading(false);
    }
  }

  function formatFacultyDetailsForChat(details) {
    if (!details.details) {
      return "No faculty details found.";
    }
    
    const faculty = details.details;
    let content = `👨‍🏫 **Faculty Details**\n\n`;
    
    // Add photo if available
    if (faculty.photoUrl) {
      content += `![Faculty Photo](${faculty.photoUrl})\n\n`;
    }
    
    content += `**${faculty.name || 'Name not available'}**\n`;
    content += `📋 Designation: ${faculty.designation || 'Not specified'}\n`;
    content += `🏫 Department: ${faculty.department || 'Not specified'}\n`;
    content += `🏛️ School: ${faculty.school || 'Not specified'}\n`;
    content += `📧 Email: ${faculty.email || 'Not specified'}\n`;
    content += `🚪 Cabin: ${faculty.cabin || 'Not specified'}\n\n`;
    
    if (faculty.openHours && faculty.openHours.length > 0) {
      content += `**Office Hours:**\n`;
      faculty.openHours.forEach((hours) => {
        content += `• ${hours.day}: ${hours.timing}\n`;
      });
    } else {
      content += `**Office Hours:** Not specified\n`;
    }
    
    return content;
  }

  async function fetchMessOptions() {
    // Reset mess menu state when fetching new options
    resetMessMenuState();
    setMessOptionsLoading(true);
    
    try {
      const res = await fetch("/api/mess", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch mess options");
      }
      
      if (data.success) {
        console.log('Received mess options:', data);
        
        setMessOptions(data);
        
        const optionsContent = formatMessOptionsForChat(data);
        
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: optionsContent,
            messOptions: data,
            showMessOptions: true,
          },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [...prev, { 
        role: "assistant", 
        content: `Failed to fetch mess options: ${err.message}` 
      }]);
    } finally {
      setMessOptionsLoading(false);
    }
  }

  function formatMessOptionsForChat(options) {
    let content = `🍽️ **Mess Menu Options**\n\n`;
    
    content += `**Available Hostel Types:**\n`;
    options.hostelTypes.forEach((hostel, index) => {
      content += `${index + 1}. ${hostel.label || hostel.name}\n`;
    });
    
    content += `\n**Available Mess Types:**\n`;
    options.messTypes.forEach((mess, index) => {
      content += `${index + 1}. ${mess.label || mess.name}\n`;
    });
    
    content += `\nPlease select your hostel type and mess type to view the menu.`;
    
    return content;
  }

  async function fetchMessMenu(hostelType, messType, date = null) {
    setMessMenuLoading(true);
    
    try {
      const res = await fetch("/api/mess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ 
          hostelType, 
          messType,
          selectedDate: date
        }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch mess menu");
      }
      
      if (data.success) {
        console.log('Received mess menu:', data);
        
        setMessMenu(data);
        setSelectedDate(data.selectedDate);
        
        // Only add the menu content if it's a new request or different date
        const lastMessage = messages[messages.length - 1];
        const isNewRequest = !lastMessage || 
                           !lastMessage.messMenu || 
                           lastMessage.messMenu.hostelType !== data.hostelType ||
                           lastMessage.messMenu.messType !== data.messType ||
                           lastMessage.messMenu.selectedDate !== data.selectedDate;
        
        if (isNewRequest) {
          // Only add the styled UI component, not the text message
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: "", // Empty content - we'll show the UI instead
              messMenu: data,
              showMessMenu: true,
            },
          ]);
        }
      }
    } catch (err) {
      setMessages((prev) => [...prev, { 
        role: "assistant", 
        content: `Failed to fetch mess menu: ${err.message}` 
      }]);
    } finally {
      setMessMenuLoading(false);
    }
  }

  function formatMessMenuForChat(menuData) {
    if (!menuData || menuData.error) {
      return `🍽️ **Mess Menu**\n\n❌ Failed to load mess menu. Please try again later.`;
    }

    let content = `🍽️ **Mess Menu**\n\n`;
    
    content += `📅 **${menuData.dayName}, ${menuData.date}**\n\n`;
    
    content += `🏠 **Hostel:** ${menuData.hostelType || 'Not specified'}\n`;
    content += `🍴 **Mess Type:** ${menuData.messType || 'Not specified'}\n`;
    content += `📆 **Date:** Day ${menuData.selectedDate}\n\n`;

    if (menuData.menuItems && menuData.menuItems.length > 0) {
      menuData.menuItems.forEach((meal) => {
        content += `**${meal.meal}:**\n`;
        meal.items.forEach((item) => {
          content += `• ${item}\n`;
        });
        content += `\n`;
      });
    } else {
      content += `📝 **Menu information is currently unavailable.**\n`;
      content += `Please try again later or select a different mess type.`;
    }

    return content;
  }

  async function submitPrompt(currentPrompt) {
    const trimmed = currentPrompt.trim();
    if (!trimmed) return;

    // Check if this is a digital assignments request (very specific detection)
    const lowerTrimmed = trimmed.toLowerCase();
    const isAssignmentsRequest = lowerTrimmed.includes('digital assignment') || 
                                lowerTrimmed.includes('digital assignments') ||
                                lowerTrimmed === 'da' ||
                                lowerTrimmed === 'assignments' ||
                                (lowerTrimmed.includes('assignment') && 
                                 !lowerTrimmed.includes('attendance') &&
                                 !lowerTrimmed.includes('show my') &&
                                 !lowerTrimmed.includes('my attendance') &&
                                 !lowerTrimmed.includes('attendance') &&
                                 !lowerTrimmed.includes('show') &&
                                 !lowerTrimmed.includes('my'));

    // Check if this is a faculty search request
    const isFacultySearchRequest = lowerTrimmed.includes('faculty') ||
                                   lowerTrimmed.includes('professor') ||
                                   lowerTrimmed.includes('teacher') ||
                                   lowerTrimmed.includes('instructor') ||
                                   lowerTrimmed.includes('who is') ||
                                   lowerTrimmed.includes('search faculty') ||
                                   lowerTrimmed.includes('find faculty') ||
                                   (lowerTrimmed.includes('devipriya') || 
                                    lowerTrimmed.includes('thamil') || 
                                    lowerTrimmed.includes('siva') || 
                                    lowerTrimmed.includes('lakshmi') || 
                                    lowerTrimmed.includes('ranjith') || 
                                    lowerTrimmed.includes('murugan'));

    // Check if this is a mess menu request
    const isMessMenuRequest = lowerTrimmed.includes('mess menu') ||
                              lowerTrimmed.includes('mess') ||
                              lowerTrimmed.includes('cafeteria') ||
                              lowerTrimmed.includes('food') ||
                              lowerTrimmed.includes('menu') ||
                              lowerTrimmed.includes('dining') ||
                              lowerTrimmed.includes('hostel food') ||
                              lowerTrimmed.includes('what to eat') ||
                              lowerTrimmed.includes('today menu') ||
                              lowerTrimmed.includes('messit');

    if (isAssignmentsRequest) {
      setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
      setToast(`→ ${trimmed}`);
      setPrompt("");
      await fetchDigitalAssignments();
      return;
    }

    if (isFacultySearchRequest) {
      setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
      setToast(`→ ${trimmed}`);
      setPrompt("");
      
      // Extract faculty name from query
      let facultyQuery = trimmed;
      
      // Remove common prefixes and suffixes
      facultyQuery = facultyQuery.replace(/^(who is|search for|find|look for|faculty|professor|teacher|instructor)\s*/gi, '');
      facultyQuery = facultyQuery.replace(/\s*(ma'am|sir|dr\.?|prof\.?|mr\.?|mrs\.?|ms\.?)$/gi, '');
      facultyQuery = facultyQuery.trim();
      
      // If query is too short after cleaning, use original
      if (facultyQuery.length < 3) {
        facultyQuery = trimmed;
      }
      
      console.log('Faculty search - Original query:', trimmed);
      console.log('Faculty search - Cleaned query:', facultyQuery);
      
      await fetchFacultySearch(facultyQuery);
      return;
    }

    if (isMessMenuRequest) {
      setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
      setToast(`→ ${trimmed}`);
      setPrompt("");
      // Reset messit session and reset state for fresh mess menu session
      await resetMessitSession();
      await fetchMessOptions();
      return;
    }

    // Check if Reddit search is enabled and perform Reddit search
    if (redditSearchEnabled) {
      setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
      setToast(`→ ${trimmed}`);
      setPrompt("");
      
      // Set searching state and add delay
      setRedditSearching(true);
      
      try {
        // Add a 2-second delay to show the animation
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const redditData = await searchReddit(trimmed);
        
        // Add Reddit posts directly to chat as interactive cards
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `🔍 **Reddit Search Results for "${trimmed}"**\n\nFound ${redditData.totalResults} posts in r/vit:`,
            redditPosts: redditData
          }
        ]);
      } catch (error) {
        console.error('Reddit search error:', error);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "❌ Failed to search Reddit. Please try again later."
          }
        ]);
      } finally {
        setRedditSearching(false);
      }
      return;
    }

    // Check if this is a papers search request
    if (detectPapersIntent(trimmed)) {
      setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
      setToast(`→ ${trimmed}`);
      setPrompt("");
      
      // Set searching state and add delay
      setPapersSearching(true);
      
      try {
        // Add a 2-second delay to show the animation
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const subject = extractSubjectFromQuery(trimmed);
        const papersData = await searchPapers(subject);
        
        // Handle different response types
        if (papersData.error) {
          // Show error message with direct link
          let errorContent = `❌ **Papers Search Error**\n\n${papersData.error}\n\n`;
          
          if (papersData.directLink) {
            errorContent += `🔗 **Direct Link:** [Search on CodeChef Papers](${papersData.directLink})\n\n`;
          }
          
          if (papersData.note) {
            errorContent += `ℹ️ **Note:** ${papersData.note}`;
          }
          
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: errorContent
            }
          ]);
        } else if (papersData.totalResults === 0) {
          // No papers found
          let noResultsContent = `📚 **Papers Search Results for "${subject}"**\n\nNo papers found for this subject.\n\n`;
          
          if (papersData.directLink) {
            noResultsContent += `🔗 **Try searching directly:** [CodeChef Papers](${papersData.directLink})`;
          }
          
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: noResultsContent
            }
          ]);
        } else {
          // Success - show papers
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `📚 **Papers Search Results for "${subject}"**\n\nFound ${papersData.totalResults} papers:`,
              papers: papersData
            }
          ]);
        }
      } catch (error) {
        console.error('Papers search error:', error);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "❌ Failed to search papers. Please try again later."
          }
        ]);
      } finally {
        setPapersSearching(false);
      }
      return;
    }
    
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setToast(`→ ${trimmed}`);
    setLoading(true);
    setPrompt("");

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ prompt: trimmed }),
      });
      const data = await res.json();
      const content = data.text || data.error || "No response";
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content,
          faculties: data.faculties || (data.faculty ? [data.faculty] : null),
          club: data.club || null,
          requiresVtopLogin: data.requiresVtopLogin || false,
        },
      ]);
    } catch (error) {
      const fallback = error instanceof Error ? error.message : "Something went wrong";
      setMessages((prev) => [...prev, { role: "assistant", content: fallback }]);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    await submitPrompt(prompt);
  }

  function handleQuickAction(fillValue) {
    setPrompt(fillValue);
    inputRef.current?.focus();
  }

  return (
    <>
      <div className="stars" aria-hidden="true" />
      <div className="stars stars--slow" aria-hidden="true" />
      <div className="shooting-stars" aria-hidden="true">
        <span />
      </div>

      {/* VTOP Login Component - appears in corner when signed in */}
      <SignedIn>
        <VtopLogin />
      </SignedIn>

      <div className={isSignedIn ? "wrap" : "wrap wrap--landing"}>
        <header>
          <div className="wordmark">VIT CHAT BOT</div>
          <SignedIn>
            <div className="auth-actions">
              <UserButton afterSignOutUrl="/" />
            </div>
          </SignedIn>
        </header>

        <main>
          <SignedOut>
            <section className="auth-landing" aria-label="Authentication required">
              <div className="auth-landing__background" aria-hidden="true">
                <span className="auth-landing__orb" />
                <span className="auth-landing__orb auth-landing__orb--blue" />
                <span className="auth-landing__ring" />
              </div>

              <div className="auth-landing__card">
                <div className="auth-landing__sparkles" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>

                <p className="auth-landing__eyebrow">Account Required</p>
                <h2 className="auth-landing__title">Step inside the VIT experience</h2>
                <p className="auth-landing__meta">
                  Sign in or create an account to unlock personalised schedules, faculty lookups, and curated campus
                  updates—all in one secure place.
                </p>

                <ul className="auth-landing__highlights">
                  <li>Sync attendance insights tailored to your timetable</li>
                  <li>Discover clubs and events picked for your interests</li>
                  <li>Chat with verified information drawn from VIT sources</li>
                </ul>

                <div className="auth-landing__cta">
                  <SignInButton mode="modal">
                    <button type="button" className="auth-landing__button">
                      Sign in
                    </button>
                  </SignInButton>
                  <SignUpButton mode="modal">
                    <button type="button" className="auth-landing__button auth-landing__button--ghost">
                      Register
                    </button>
                  </SignUpButton>
                </div>

                <p className="auth-landing__note">No spam—just smarter campus conversations.</p>
              </div>
            </section>
          </SignedOut>

          <SignedIn>
            <div
              className="tab-switcher"
              role="tablist"
              aria-label="Primary sections"
            >
              <button
                type="button"
                role="tab"
                id="tab-chat"
                aria-controls="tabpanel-chat"
                aria-selected={activeTab === "chat"}
                className={`tab-switcher__button${activeTab === "chat" ? " is-active" : ""}`}
                onClick={() => setActiveTab("chat")}
              >
                Chatbot
              </button>
              <button
                type="button"
                role="tab"
                id="tab-about"
                aria-controls="tabpanel-about"
                aria-selected={activeTab === "about"}
                className={`tab-switcher__button${activeTab === "about" ? " is-active" : ""}`}
                onClick={() => setActiveTab("about")}
              >
                About
              </button>
            </div>
            {activeTab === "chat" ? (
              <section
                className="hero"
                aria-label="Greeting"
                role="tabpanel"
                id="tabpanel-chat"
                aria-labelledby="tab-chat"
              >
              <h1>Hey VITian, ready to catch up?</h1>
              <p className="sub">{heroSubtitle}</p>

              <div className="chips" role="list">
                {QUICK_ACTIONS.map((action) => (
                  <button
                    key={action.label}
                    className="chip"
                    type="button"
                    data-fill={action.fill}
                    onClick={() => handleQuickAction(action.fill)}
                  >
                    {action.label}
                  </button>
                ))}
              </div>

              <div className="chat-thread" aria-live="polite">
                {messages.map((message, index) => {
                  const faculties = message.faculties || (message.faculty ? [message.faculty] : null);

                  return (
                    <article
                      key={`${message.role}-${index}`}
                      className={`bubble ${message.role}`}
                      aria-label={message.role === "user" ? "User message" : "Assistant message"}
                    >
                      <span className="bubble-label">
                        {message.role === "user" ? "You" : BOT_NAME}
                      </span>
                      {message.content && (
                        <div className="bubble-text">
                          <ReactMarkdown>{message.content}</ReactMarkdown>
                        </div>
                      )}

                      {message.redditPosts && (
                        <RedditPostsContainer
                          posts={message.redditPosts.posts}
                          query={message.redditPosts.query}
                          mockData={message.redditPosts.mockData}
                          error={message.redditPosts.error}
                        />
                      )}

                      {message.papers && (
                        <PapersContainer
                          papers={message.papers.papers}
                          subject={message.papers.subject}
                          mockData={message.papers.mockData}
                          error={message.papers.error}
                        />
                      )}

                      {faculties && faculties.length > 0 && (
                        <div className="profile-card-grid">
                          {faculties.map((faculty) => (
                            <div
                              className="profile-card profile-card--faculty"
                              key={`${faculty.name}-${faculty.school || "unknown"}`}
                            >
                              {faculty.photoUrl && (
                                <div className="profile-card__media">
                                  <img
                                    src={faculty.photoUrl}
                                    alt={`Photo of ${faculty.name}`}
                                    loading="lazy"
                                  />
                                </div>
                              )}
                              <div className="profile-card__body">
                                <h3>{faculty.name}</h3>
                                <p className="profile-card__meta">
                                  {faculty.position}
                                  {faculty.school ? ` · ${faculty.school}` : ""}
                                </p>
                                {faculty.subject && (
                                  <p className="profile-card__subtitle">Focus: {faculty.subject}</p>
                                )}
                                {faculty.readMoreUrl && (
                                  <a
                                    className="profile-card__link"
                                    href={faculty.readMoreUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    View full profile ↗
                                  </a>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {message.club && (
                        <div className="profile-card profile-card--club">
                          {message.club.imageUrl && (
                            <div className="profile-card__media">
                              <img
                                src={message.club.imageUrl}
                                alt={`Logo for ${message.club.name}`}
                                loading="lazy"
                              />
                            </div>
                          )}
                          <div className="profile-card__body">
                            <h3>{message.club.name}</h3>
                            <p className="profile-card__meta">{message.club.category}</p>
                            {message.club.description && (
                              <p className="profile-card__subtitle">{message.club.description}</p>
                            )}
                            {message.club.contactEmail && (
                              <p className="profile-card__subtitle">Contact: {message.club.contactEmail}</p>
                            )}
                            {message.club.sourceUrl && (
                              <a
                                className="profile-card__link"
                                href={message.club.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Visit club page ↗
                              </a>
                            )}
                          </div>
                        </div>
                      )}

                      {message.showSemesterDropdown && message.semesters && message.semesters.length > 1 && (
                        <div className="assignments-semester-selector">
                          <div className="semester-selector-header">
                            <h4>📚 Select Semester</h4>
                            <p>Choose a different semester to view assignments</p>
                          </div>
                          <div className="semester-dropdown-container">
                            <select
                              value={message.semester?.value || ''}
                              onChange={async (e) => {
                                const semester = message.semesters.find(s => s.value === e.target.value);
                                if (semester) {
                                  await fetchDigitalAssignments(semester.label);
                                }
                              }}
                              disabled={assignmentsLoading}
                              className="semester-dropdown"
                            >
                              {message.semesters.map((semester) => (
                                <option key={semester.value} value={semester.value}>
                                  {semester.label}
                                </option>
                              ))}
                            </select>
                            {assignmentsLoading && (
                              <div className="loading-indicator">
                                <span className="loading-spinner"></span>
                                Loading assignments...
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {message.assignments && message.assignments.length > 0 && (
                        <div className="assignments-course-selector">
                          <div className="course-selector-header">
                            <h4>📖 Select Course</h4>
                            <p>Choose a course to view detailed assignments with due dates</p>
                          </div>
                          <div className="course-dropdown-container">
                            <select
                              value={selectedCourse?.dashboardRef || ''}
                              onChange={async (e) => {
                                const classId = e.target.value;
                                console.log('Course dropdown changed:', classId);
                                console.log('Available assignments:', message.assignments);
                                
                                if (classId) {
                                  const course = message.assignments.find(a => a.dashboardRef === classId);
                                  console.log('Found course:', course);
                                  if (course) {
                                    setSelectedCourse(course);
                                    await fetchCourseDetails(classId);
                                  }
                                } else {
                                  setSelectedCourse(null);
                                  setCourseDetails(null);
                                }
                              }}
                              disabled={courseDetailsLoading}
                              className="course-dropdown"
                            >
                              <option value="">Select a course...</option>
                              {message.assignments.map((assignment) => (
                                <option key={assignment.dashboardRef} value={assignment.dashboardRef}>
                                  {assignment.courseCode} - {assignment.courseTitle} ({assignment.courseType})
                                </option>
                              ))}
                            </select>
                            {courseDetailsLoading && (
                              <div className="loading-indicator">
                                <span className="loading-spinner"></span>
                                Loading course details...
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {message.facultyResults && message.facultyResults.length > 0 && (
                        <div className="faculty-search-selector">
                          <div className="faculty-selector-header">
                            <h4>👨‍🏫 Select Faculty</h4>
                            <p>Choose a faculty member to view detailed information</p>
                          </div>
                          <div className="faculty-dropdown-container">
                            <select
                              value={selectedFaculty?.employeeId || ''}
                              onChange={async (e) => {
                                const employeeId = e.target.value;
                                console.log('Faculty dropdown changed:', employeeId);
                                console.log('Available faculty:', message.facultyResults);
                                
                                if (employeeId) {
                                  const faculty = message.facultyResults.find(f => f.employeeId === employeeId);
                                  console.log('Found faculty:', faculty);
                                  if (faculty) {
                                    setSelectedFaculty(faculty);
                                    await fetchFacultyDetails(employeeId);
                                  }
                                } else {
                                  setSelectedFaculty(null);
                                  setFacultyDetails(null);
                                }
                              }}
                              disabled={facultyDetailsLoading}
                              className="faculty-dropdown"
                            >
                              <option value="">Select a faculty member...</option>
                              {message.facultyResults.map((faculty) => (
                                <option key={faculty.employeeId} value={faculty.employeeId}>
                                  {faculty.name} - {faculty.designation} ({faculty.school})
                                </option>
                              ))}
                            </select>
                            {facultyDetailsLoading && (
                              <div className="loading-indicator">
                                <span className="loading-spinner"></span>
                                Loading faculty details...
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {message.showMessOptions && message.messOptions && (
                        <div className="mess-options-selector">
                          <div className="mess-options-header">
                            <h4>🍽️ Select Mess Options</h4>
                            <p>Choose your hostel type and mess type to view the menu</p>
                          </div>
                          <div className="mess-dropdowns-container">
                            <div className="mess-dropdown-group">
                              <label>Hostel Type:</label>
                              <select
                                value={selectedHostelType?.value || ''}
                                onChange={(e) => {
                                  const hostelValue = e.target.value;
                                  if (hostelValue) {
                                    const hostel = message.messOptions.hostelTypes.find(h => h.value === hostelValue);
                                    if (hostel) {
                                      setSelectedHostelType(hostel);
                                    }
                                  } else {
                                    setSelectedHostelType(null);
                                  }
                                }}
                                disabled={messOptionsLoading}
                                className="mess-dropdown"
                              >
                                <option value="">Select hostel type...</option>
                                {message.messOptions.hostelTypes.map((hostel) => (
                                  <option key={hostel.value} value={hostel.value}>
                                    {hostel.label || hostel.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            
                            <div className="mess-dropdown-group">
                              <label>Mess Type:</label>
                              <select
                                value={selectedMessType?.value || ''}
                                onChange={(e) => {
                                  const messValue = e.target.value;
                                  if (messValue) {
                                    const mess = message.messOptions.messTypes.find(m => m.value === messValue);
                                    if (mess) {
                                      setSelectedMessType(mess);
                                    }
                                  } else {
                                    setSelectedMessType(null);
                                  }
                                }}
                                disabled={messOptionsLoading}
                                className="mess-dropdown"
                              >
                                <option value="">Select mess type...</option>
                                {message.messOptions.messTypes.map((mess) => (
                                  <option key={mess.value} value={mess.value}>
                                    {mess.label || mess.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            
                            <button
                              className="mess-submit-btn"
                              onClick={async () => {
                                if (selectedHostelType && selectedMessType) {
                                  await fetchMessMenu(selectedHostelType.value, selectedMessType.value);
                                }
                              }}
                              disabled={!selectedHostelType || !selectedMessType || messMenuLoading}
                            >
                              {messMenuLoading ? "Loading Menu..." : "View Menu"}
                            </button>
                            
                            {messOptionsLoading && (
                              <div className="loading-indicator">
                                <span className="loading-spinner"></span>
                                Loading options...
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {message.showMessMenu && message.messMenu && message.messMenu.availableDates && (
                        <div className="mess-menu-selector">
                          <div className="mess-menu-header">
                            <h4>📅 Select Date</h4>
                            <p>Choose a date to view the menu for that day</p>
                          </div>
                          <div className="mess-date-container">
                            <select
                              value={selectedDate || ''}
                              onChange={async (e) => {
                                const date = e.target.value;
                                if (date && selectedHostelType && selectedMessType) {
                                  setSelectedDate(parseInt(date));
                                  await fetchMessMenu(selectedHostelType.value, selectedMessType.value, date);
                                }
                              }}
                              disabled={messMenuLoading}
                              className="mess-date-dropdown"
                            >
                              <option value="">Select date...</option>
                              {message.messMenu.availableDates.map((date) => (
                                <option key={`day-${date.dayNumber}`} value={`${date.dayNumber}`}>
                                  {date.isToday ? '✅ ' : '📅 '}Day {date.dayNumber}{date.isToday ? ' (Today)' : ''}
                                </option>
                              ))}
                            </select>
                            
                            {messMenuLoading && (
                              <div className="loading-indicator">
                                <span className="loading-spinner"></span>
                                Loading menu...
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {message.messMenu && message.messMenu.menuItems && message.messMenu.menuItems.length > 0 && (
                        <div className="mess-menu-display">
                          <div className="mess-menu-title">
                            {message.messMenu.hostelType} - {message.messMenu.messType}
                          </div>
                          <div className="mess-menu-subtitle">
                            {message.messMenu.dayName}, {message.messMenu.date} • Day {message.messMenu.selectedDate}
                            {message.messMenu.isRealTime && (
                              <span style={{ marginLeft: '8px', fontSize: '0.85em', opacity: 0.8 }}>
                                (Real-time data)
                              </span>
                            )}
                          </div>
                          
                          {message.messMenu.menuItems.map((meal, index) => (
                            <div key={index} className="mess-meal-section" data-meal={meal.meal.toLowerCase()}>
                              <div className="mess-meal-title">
                                {meal.meal}
                              </div>
                              <div className="mess-meal-items">
                                {meal.items.map((item, itemIndex) => (
                                  <div key={itemIndex} className="mess-meal-item">
                                    {item}
                                  </div>
                                ))}
                              </div>
                              <div className="mess-meal-time">
                                {meal.time || 'Time not specified'}
                              </div>
                            </div>
                          ))}
                          
                          <div style={{ marginTop: '20px', padding: '16px', background: 'rgba(83, 192, 211, 0.1)', borderRadius: '12px', border: '1px solid rgba(83, 192, 211, 0.3)' }}>
                            <div style={{ color: '#53C0D3', fontWeight: '600', marginBottom: '8px' }}>ℹ️ Menu Information</div>
                            <div style={{ fontSize: '0.9em', color: 'var(--muted)', lineHeight: '1.4' }}>
                              • Real-time data from messit.vinnovateit.com<br/>
                              • Use the date selector above to view different dates<br/>
                              • Menu items may vary based on availability
                            </div>
                          </div>
                        </div>
                      )}

                    </article>
                  );
                })}

                {loading && (
                  <article className="bubble assistant typing" aria-label="Assistant is typing">
                    <span className="bubble-label">{BOT_NAME}</span>
                    <div className="typing-dots" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </div>
                  </article>
                )}

                {!messages.length && !loading && (
                  <div className="chat-placeholder">
                    <strong>Start the chat</strong>
                    <span>
                      Ask about your schedule, attendance, cafeteria menus, or anything else on campus.
                    </span>
                  </div>
                )}
              </div>
            </section>
            ) : (
              <section
                className="about-tab"
                aria-label="About VIT Chat Bot"
                role="tabpanel"
                id="tabpanel-about"
                aria-labelledby="tab-about"
              >
                <div className="about-card">
                  <h1>About VIT Chat Bot</h1>
                  <p>
                    VIT Chat Bot is your personalised campus companion. It blends verified VTOP data with
                    real-time AI assistance so you can quickly review attendance, assignments, mess menus,
                    faculty information, and trending discussions without leaving one window.
                  </p>

                  <div className="about-card__grid">
                    <div className="about-card__section">
                      <h2>Why students love it</h2>
                      <ul>
                        <li>Conversational interface powered by Google Gemini.</li>
                        <li>Secure Clerk sign-in keeps your VTOP data protected.</li>
                        <li>Instant access to faculty, clubs, papers, and mess menus.</li>
                      </ul>
                    </div>

                    <div className="about-card__section">
                      <h2>Download &amp; run locally</h2>
                      <ol>
                        <li>Download the latest project archive using the button below.</li>
                        <li>Extract the zip and open the folder in your terminal.</li>
                        <li>
                          Create a <code>.env</code> file with your <code>GEMINI_API_KEY</code>,
                          <code>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code>, and <code>CLERK_SECRET_KEY</code>.
                        </li>
                        <li>Run <code>npm install</code> followed by <code>npm run dev</code>.</li>
                      </ol>
                      <a
                        className="download-button"
                        href="https://github.com/m-rithik/VIT-chatbot/archive/refs/heads/main.zip"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Download Project (.zip)
                      </a>
                    </div>
                  </div>
                </div>
              </section>
            )}
          </SignedIn>
        </main>

        <footer />
      </div>

      <SignedIn>
        {activeTab === "chat" && (
          <form className="dock" role="search" onSubmit={handleSubmit}>
            <RedditToggle 
              isActive={redditSearchEnabled} 
              onToggle={() => setRedditSearchEnabled(!redditSearchEnabled)}
              isSearching={redditSearching}
            />
            <input
              ref={inputRef}
              id="prompt"
              className="input"
              placeholder={redditSearchEnabled ? "Search r/vit..." : "Talk to me..."}
              aria-label="Chat input"
              value={prompt}
              disabled={loading}
              onChange={(event) => setPrompt(event.target.value)}
            />
            <button
              className="btn"
              id="mic"
              type="button"
              title="Voice input (upcoming)"
              onClick={() => setToast("Voice input coming soon")}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M12 14a3 3 0 0 0 3-3V7a3 3 0 1 0-6 0v4a3 3 0 0 0 3 3Zm7-3a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.92V20H8a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2h-3v-2.08A7 7 0 0 0 19 11Z"
                  fill="currentColor"
                />
              </svg>
            </button>
            <button className="btn send" id="send" type="submit" title="Send" disabled={loading}>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path d="M3.4 20.6 21 12 3.4 3.4 5 11l10 1-10 1-1.6 7.6Z" fill="currentColor" />
              </svg>
            </button>
          </form>
        )}
      </SignedIn>

      {toast && (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}

    </>
  );
}
