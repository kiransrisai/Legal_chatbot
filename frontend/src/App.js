import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import toText from 'markdown-to-text';
import useAudioRecorder from './useAudioRecorder';
import Sidebar from './Sidebar';
import AuthModal from './AuthModal';
import './App.css';

const API_BASE_URL = 'http://localhost:5001';

// Create axios instance with interceptor for authentication
const api = axios.create({
  baseURL: API_BASE_URL
});

// Add token to every request
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, error => Promise.reject(error));

// Handle 401 errors globally
api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.reload();
    }
    return Promise.reject(error);
  }
);

// --- TTS Utility ---
const speech = {
  synth: window.speechSynthesis,
  utterance: null,
  speak: function(text, onEndCallback) {
    if (this.synth.speaking) { this.synth.cancel(); }
    this.utterance = new SpeechSynthesisUtterance(text);
    this.utterance.onend = onEndCallback;
    this.synth.speak(this.utterance);
  },
  cancel: function() { this.synth.cancel(); }
};

const App = () => {
  // Authentication states
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Chat states
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState(null);
  
  // Conversation management states
  const [conversations, setConversations] = useState([]);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);

  const { isRecording, startRecording, stopRecording, audioBlob } = useAudioRecorder();
  const fileInputRef = useRef(null);
  const chatBoxRef = useRef(null);

  // Check authentication on mount
  useEffect(() => {
    checkAuth();
  }, []);

  // Load conversations when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      loadConversations();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (chatBoxRef.current) { 
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight; 
    }
  }, [messages]);

  useEffect(() => {
    if (audioBlob) { handleTranscription(audioBlob); }
  }, [audioBlob]);

  const checkAuth = async () => {
    const token = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    
    if (!token || !storedUser) {
      setIsCheckingAuth(false);
      setShowAuthModal(true);
      return;
    }

    try {
      const response = await api.get('/verify');
      if (response.data.valid) {
        setIsAuthenticated(true);
        setUser(JSON.parse(storedUser));
      } else {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setShowAuthModal(true);
      }
    } catch (error) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setShowAuthModal(true);
    } finally {
      setIsCheckingAuth(false);
    }
  };

  const handleLogin = async (email, password) => {
    try {
      const response = await axios.post(`${API_BASE_URL}/login`, { email, password });
      const { token, username, user_id } = response.data;
      
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify({ username, user_id }));
      
      setIsAuthenticated(true);
      setUser({ username, user_id });
      setShowAuthModal(false);
      
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.error || 'Login failed' 
      };
    }
  };

  const handleRegister = async (username, email, password) => {
    try {
      await axios.post(`${API_BASE_URL}/register`, { username, email, password });
      // Auto-login after registration
      return await handleLogin(email, password);
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.error || 'Registration failed' 
      };
    }
  };

  const handleLogout = async () => {
    try {
      await api.post('/logout');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setIsAuthenticated(false);
      setUser(null);
      setMessages([]);
      setConversations([]);
      setCurrentConversationId(null);
      setShowAuthModal(true);
    }
  };

  const loadConversations = async () => {
    try {
      setIsLoadingConversations(true);
      const response = await api.get('/conversations');
      setConversations(response.data.conversations);
    } catch (error) {
      console.error("Error loading conversations:", error);
    } finally {
      setIsLoadingConversations(false);
    }
  };

  const loadConversation = async (conversationId) => {
    try {
      setIsLoading(true);
      const response = await api.get(`/conversations/${conversationId}`);
      const conversationMessages = response.data.messages.map(msg => ({
        role: msg.role,
        content: msg.content,
        relatedQuestions: msg.role === 'assistant' ? [] : undefined
      }));
      setMessages(conversationMessages);
      setCurrentConversationId(conversationId);
      setSidebarOpen(false);
    } catch (error) {
      console.error("Error loading conversation:", error);
      alert("Failed to load conversation");
    } finally {
      setIsLoading(false);
    }
  };

  const createNewConversation = async () => {
    try {
      const response = await api.post('/conversations/new');
      const newConversationId = response.data.conversation_id;
      setCurrentConversationId(newConversationId);
      setMessages([]);
      setSidebarOpen(false);
      await loadConversations();
    } catch (error) {
      console.error("Error creating new conversation:", error);
      setCurrentConversationId(null);
      setMessages([]);
      setSidebarOpen(false);
    }
  };

  const deleteConversation = async (conversationId) => {
    if (!window.confirm("Are you sure you want to delete this conversation?")) return;
    
    try {
      await api.delete(`/conversations/${conversationId}`);
      
      if (conversationId === currentConversationId) {
        setMessages([]);
        setCurrentConversationId(null);
      }
      
      await loadConversations();
    } catch (error) {
      console.error("Error deleting conversation:", error);
      alert("Failed to delete conversation");
    }
  };

  const handleToggleSpeech = (messageId, markdownText) => {
    if (isSpeaking && speakingMessageId === messageId) {
      speech.cancel();
      setIsSpeaking(false);
      setSpeakingMessageId(null);
    } else {
      const plainText = toText(markdownText);
      setIsSpeaking(true);
      setSpeakingMessageId(messageId);
      speech.speak(plainText, () => {
        setIsSpeaking(false);
        setSpeakingMessageId(null);
      });
    }
  };

  const handleSendMessage = async (queryOverride) => {
    const query = queryOverride || input.trim();
    if ((!query && !selectedImage) || isLoading) return;

    setMessages(prevMessages => {
        let updatedMessages = [...prevMessages];
        
        if (queryOverride) {
            const lastMessageIndex = updatedMessages.length - 1;
            if (lastMessageIndex >= 0 && updatedMessages[lastMessageIndex].role === 'assistant') {
                updatedMessages[lastMessageIndex] = {
                    ...updatedMessages[lastMessageIndex],
                    relatedQuestions: []
                };
            }
        }
        
        const userMessage = { role: 'user', content: query };
        return [...updatedMessages, userMessage];
    });

    setInput('');
    setIsLoading(true);

    try {
      let response;
      if (selectedImage) {
        const formData = new FormData();
        formData.append('question', query);
        formData.append('image', selectedImage);
        if (currentConversationId) {
          formData.append('conversation_id', currentConversationId);
        }
        response = await api.post('/chat_vision', formData);
        setSelectedImage(null);
        setImagePreview(null);
      } else {
        const requestData = { question: query };
        if (currentConversationId) {
          requestData.conversation_id = currentConversationId;
        }
        response = await api.post('/chat', requestData);
      }
      
      const { answer, related_questions, conversation_id } = response.data;
      
      if (!currentConversationId && conversation_id) {
        setCurrentConversationId(conversation_id);
        await loadConversations();
      }
      
      const assistantMessage = {
        role: 'assistant',
        content: answer,
        relatedQuestions: related_questions || []
      };
      setMessages(prev => [...prev, assistantMessage]);

    } catch (error) {
      console.error("Error fetching response:", error);
      const errorMessage = error.response?.data?.error || "Sorry, something went wrong.";
      setMessages(prev => [...prev, { role: 'assistant', content: errorMessage, relatedQuestions: [] }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const fileType = file.type.split('/')[0];
    if (fileType === 'image') {
      setSelectedImage(file);
      setImagePreview(URL.createObjectURL(file));
    } else {
      handleDocumentUpload(file);
    }
    event.target.value = null;
  };

  const handleDocumentUpload = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    setMessages(prev => [...prev, {role: 'system', content: `Uploading ${file.name}...`}]);
    try {
      const response = await api.post('/upload_document', formData);
      setMessages(prev => [...prev, {role: 'system', content: response.data.message}]);
    } catch (error) {
      const errorMessage = error.response?.data?.error || "File upload failed.";
      setMessages(prev => [...prev, { role: 'system', content: errorMessage }]);
    }
  };

  const handleTranscription = async (blob) => {
    const formData = new FormData();
    formData.append('audio', blob, 'audio.webm');
    try {
      const response = await api.post('/transcribe', formData);
      setInput(prev => (prev ? prev + ' ' : '') + response.data.transcription);
    } catch (error) {
      console.error("Error transcribing audio:", error);
      alert("Audio transcription failed.");
    }
  };

  const MarkdownRenderer = {
    code({ node, inline, className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || '');
      return !inline && match ? (
        <SyntaxHighlighter style={vscDarkPlus} language={match[1]} PreTag="div" {...props}>
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
      ) : (
        <code className={className} {...props}>{children}</code>
      );
    },
  };

  if (isCheckingAuth) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <AuthModal 
        isOpen={showAuthModal}
        onLogin={handleLogin}
        onRegister={handleRegister}
      />
    );
  }

  return (
    <div className="app-container">
      <Sidebar 
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        conversations={conversations}
        currentConversationId={currentConversationId}
        onSelectConversation={loadConversation}
        onNewConversation={createNewConversation}
        onDeleteConversation={deleteConversation}
        onLogout={handleLogout}
        user={user}
        isLoading={isLoadingConversations}
      />
      
      <div className={`main-content ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="header">
          <button className="sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
            ☰
          </button>
          <h1>Legal ChatBot</h1>
          <button className="new-chat-button" onClick={createNewConversation}>
            New Chat
          </button>
        </div>
        
        <div className="chat-box" ref={chatBoxRef}>
          {messages.length === 0 && (
            <div className="welcome-screen">
              <div className="welcome-icon">⚖️</div>
              <h2>Welcome to Legal ChatBot</h2>
              <p>Ask me anything about legal matters, upload documents, or use voice input</p>
              <div className="feature-grid">
                <div className="feature-card">
                  <span className="feature-icon">💬</span>
                  <h3>Text Chat</h3>
                  <p>Ask legal questions</p>
                </div>
                <div className="feature-card">
                  <span className="feature-icon">🖼️</span>
                  <h3>Image Analysis</h3>
                  <p>Upload legal documents</p>
                </div>
                <div className="feature-card">
                  <span className="feature-icon">🎤</span>
                  <h3>Voice Input</h3>
                  <p>Speak your questions</p>
                </div>
                <div className="feature-card">
                  <span className="feature-icon">📄</span>
                  <h3>Document Upload</h3>
                  <p>PDF, DOCX, TXT files</p>
                </div>
              </div>
            </div>
          )}
          
          {messages.map((msg, index) => (
            <div key={index} id={`msg-${index}`} className={msg.role === 'user' ? 'user-msg' : msg.role === 'system' ? 'system-msg' : 'bot-msg'}>
              {msg.role === 'assistant' && (
                <button className="icon-button tts-button" onClick={() => handleToggleSpeech(index, msg.content)} title={isSpeaking && speakingMessageId === index ? "Stop Speaking" : "Read Aloud"}>
                  {isSpeaking && speakingMessageId === index ? '⏸️' : '🔊'}
                </button>
              )}
              <ReactMarkdown components={MarkdownRenderer}>{msg.content}</ReactMarkdown>
              {msg.role === 'assistant' && msg.relatedQuestions && msg.relatedQuestions.length > 0 && (
                <div className="related-questions">
                  {msg.relatedQuestions.map((q, i) => (
                    <button key={i} onClick={() => handleSendMessage(q)}>{q}</button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {isLoading && <div className="bot-msg spinner">Thinking...</div>}
        </div>
        
        <div className="sticky-input-area">
          {imagePreview && (
            <div className="image-preview">
              <img src={imagePreview} alt="preview" />
              <button onClick={() => { setSelectedImage(null); setImagePreview(null); }}>×</button>
            </div>
          )}
          <div className="input-container">
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".pdf,.docx,.txt,image/*" style={{ display: 'none' }} />
            <button className="icon-button" onClick={() => fileInputRef.current.click()} title="Upload File or Image">📎</button>
            <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()} placeholder="Ask a question..." />
            <button className={`icon-button ${isRecording ? 'recording' : ''}`} onClick={isRecording ? stopRecording : startRecording} title={isRecording ? 'Stop Recording' : 'Record Voice'}>
              {isRecording ? '⏹️' : '🎤'}
            </button>
            <button className="icon-button" onClick={() => handleSendMessage()} title="Send">➤</button>
          </div>
          {isRecording && <div className="recording-indicator">Recording...</div>}
        </div>
      </div>
    </div>
  );
};

export default App;