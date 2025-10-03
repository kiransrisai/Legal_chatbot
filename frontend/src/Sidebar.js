import React, { useState, useEffect } from 'react';
import './Sidebar.css';

const Sidebar = ({ 
  isOpen, 
  onClose, 
  conversations, 
  currentConversationId, 
  onSelectConversation, 
  onNewConversation, 
  onDeleteConversation,
  onLogout,
  user,
  isLoading 
}) => {
  const [hoveredConversation, setHoveredConversation] = useState(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);

  // Handle overlay animation
  useEffect(() => {
    if (isOpen) {
      setShowOverlay(true);
      // Small delay to trigger CSS transition
      setTimeout(() => {
        const overlay = document.querySelector('.sidebar-overlay');
        if (overlay) overlay.classList.add('show');
      }, 10);
    } else {
      const overlay = document.querySelector('.sidebar-overlay');
      if (overlay) overlay.classList.remove('show');
      setTimeout(() => setShowOverlay(false), 300);
    }
  }, [isOpen]);

  // Close user menu when sidebar closes
  useEffect(() => {
    if (!isOpen) {
      setShowUserMenu(false);
    }
  }, [isOpen]);

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = now - date;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffTime / (1000 * 60));
    
    if (diffMinutes < 1) {
      return 'Just now';
    } else if (diffMinutes < 60) {
      return `${diffMinutes}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return `${weeks}w ago`;
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
      });
    }
  };

  const handleDeleteClick = (e, conversationId) => {
    e.stopPropagation();
    
    // Add confirmation with better UX
    const conversation = conversations.find(c => c.id === conversationId);
    const confirmMessage = `Delete "${conversation?.title || 'this conversation'}"?\n\nThis action cannot be undone.`;
    
    if (window.confirm(confirmMessage)) {
      onDeleteConversation(conversationId);
    }
  };

  const handleLogout = () => {
    if (window.confirm('Are you sure you want to log out?\n\nYour conversations will be saved.')) {
      onLogout();
    }
    setShowUserMenu(false);
  };

  const getUserInitial = () => {
    if (user && user.username) {
      return user.username.charAt(0).toUpperCase();
    }
    return '👤';
  };

  const handleNewConversation = () => {
    onNewConversation();
    // Add subtle feedback
    const btn = document.querySelector('.new-conversation-btn');
    if (btn) {
      btn.style.transform = 'scale(0.95)';
      setTimeout(() => {
        btn.style.transform = '';
      }, 150);
    }
  };

  const handleConversationSelect = (conversationId) => {
    onSelectConversation(conversationId);
    setHoveredConversation(null);
  };

  const getTotalMessages = () => {
    return conversations.reduce((total, conv) => total + (conv.message_count || 0), 0);
  };

  const getConversationIcon = (conversation) => {
    const messageCount = conversation.message_count || 0;
    if (messageCount === 0) return '💭';
    if (messageCount < 5) return '💬';
    if (messageCount < 20) return '📝';
    return '📚';
  };

  const sortedConversations = [...conversations].sort((a, b) => {
    const dateA = new Date(a.updated_at);
    const dateB = new Date(b.updated_at);
    return dateB - dateA; // Most recent first
  });

  return (
    <>
      {showOverlay && (
        <div 
          className="sidebar-overlay" 
          onClick={onClose}
          style={{ display: 'block' }}
        />
      )}
      
      <div className={`sidebar ${isOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-header">
          <button 
            className="new-conversation-btn" 
            onClick={handleNewConversation}
            title="Start a new conversation"
          >
            <span className="icon">+</span>
            New Chat
          </button>
          <button 
            className="close-btn" 
            onClick={onClose}
            title="Close sidebar"
          >
            ✕
          </button>
        </div>
        
        <div className="conversations-list">
          {isLoading ? (
            <div className="loading-conversations">
              <div className="loading-spinner"></div>
              <span>Loading conversations...</span>
            </div>
          ) : sortedConversations.length === 0 ? (
            <div className="no-conversations">
              <p>Welcome! 👋</p>
              <p>Start your first conversation by clicking the "New Chat" button above.</p>
            </div>
          ) : (
            <>
              {sortedConversations.map((conversation, index) => (
                <div 
                  key={conversation.id}
                  className={`conversation-item ${conversation.id === currentConversationId ? 'active' : ''}`}
                  onClick={() => handleConversationSelect(conversation.id)}
                  onMouseEnter={() => setHoveredConversation(conversation.id)}
                  onMouseLeave={() => setHoveredConversation(null)}
                  style={{
                    animationDelay: isOpen ? `${index * 50}ms` : '0ms'
                  }}
                >
                  <div className="conversation-content">
                    <div className="conversation-title">
                      <span style={{ marginRight: '0.5rem' }}>
                        {getConversationIcon(conversation)}
                      </span>
                      {conversation.title || 'Untitled Conversation'}
                    </div>
                    <div className="conversation-meta">
                      <span className="message-count">
                        {conversation.message_count || 0} message{(conversation.message_count || 0) !== 1 ? 's' : ''}
                      </span>
                      <span className="conversation-date">
                        {formatDate(conversation.updated_at)}
                      </span>
                    </div>
                  </div>
                  
                  <button 
                    className="delete-btn"
                    onClick={(e) => handleDeleteClick(e, conversation.id)}
                    title={`Delete "${conversation.title || 'conversation'}"`}
                    style={{
                      opacity: hoveredConversation === conversation.id || conversation.id === currentConversationId ? 1 : 0,
                      transform: hoveredConversation === conversation.id || conversation.id === currentConversationId ? 'scale(1)' : 'scale(0.8)'
                    }}
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
        
        <div className="sidebar-footer">
          <div className="user-info-container">
            <div 
              className="user-info" 
              onClick={() => setShowUserMenu(!showUserMenu)}
              title="User menu"
            >
              <div className="user-avatar">
                {getUserInitial()}
              </div>
              <div className="user-details">
                <span className="username">{user?.username || 'Guest User'}</span>
                <span className="user-role">Legal Assistant</span>
              </div>
              <button className="user-menu-toggle">
                {showUserMenu ? '▲' : '▼'}
              </button>
            </div>
            
            {showUserMenu && (
              <div className="user-menu">
                <div className="user-menu-item user-info-item">
                  <span className="menu-icon">👤</span>
                  <div className="menu-details">
                    <span className="menu-label">Username</span>
                    <span className="menu-value">{user?.username || 'Guest'}</span>
                  </div>
                </div>
                
                <div className="user-menu-item user-info-item">
                  <span className="menu-icon">💬</span>
                  <div className="menu-details">
                    <span className="menu-label">Conversations</span>
                    <span className="menu-value">{conversations.length}</span>
                  </div>
                </div>
                
                <div className="user-menu-item user-info-item">
                  <span className="menu-icon">📊</span>
                  <div className="menu-details">
                    <span className="menu-label">Total Messages</span>
                    <span className="menu-value">{getTotalMessages()}</span>
                  </div>
                </div>
                
                <div className="user-menu-divider"></div>
                
                <button className="user-menu-item logout-btn" onClick={handleLogout}>
                  <span className="menu-icon">🚪</span>
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default Sidebar;