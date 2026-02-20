import { useState, useEffect, useRef, forwardRef } from 'react';
import styles from '../styles/itinerary_page/ChatBot.module.css';

const ChatBot = forwardRef(({ 
    onLocationResponse, 
    variant = 'floating', 
    onExpand,
    onHandleToggle,
    onHandleTouchStart,
    onHandleTouchMove,
    onHandleTouchEnd,
    sheetState,
    containerClassName = '',
    containerStyle,
    formAccessory,
    children
}, ref) => {
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);
    const textareaRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, loading]);

    // Auto-resize textarea
    const handleInputChange = (e) => {
        setInput(e.target.value);
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!input.trim() || loading) return;

        const userMessage = input.trim();
        setInput('');
        if (textareaRef.current) textareaRef.current.style.height = 'auto';

        // Add user message
        setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
        setLoading(true);

        try {
            let baseUrl = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
            if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);

            const res = await fetch(`${baseUrl}/ask`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: userMessage })
            });

            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(`Server Error ${res.status}: ${errorText}`);
            }

            const data = await res.json();

            // Add assistant message
            setMessages(prev => [...prev, { role: 'assistant', content: data.answer }]);

            if (onLocationResponse && data.locations?.length > 0) {
                onLocationResponse(data.locations);
            }

        } catch (error) {
            let errorMsg = 'Something went wrong. Please try again.';
            if (error.message.includes('Failed to fetch')) {
                errorMsg = 'Cannot connect to server. Is the backend running?';
            } else if (error.message.includes('503')) {
                errorMsg = 'The AI is waking up. Please try again in 10 seconds.';
            }
            setMessages(prev => [...prev, { role: 'assistant', content: errorMsg, isError: true }]);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    const handleExpand = () => {
        if (onExpand) onExpand();
    };

    const isSheet = variant === 'sheet';
    const isPanel = variant === 'panel';
    const isSheetCollapsed = isSheet && sheetState === 'collapsed';
    const isSheetMid = isSheet && sheetState === 'mid';
    const isSheetExpanded = isSheet && sheetState !== 'collapsed';

    const containerVariantClass = isSheet
        ? styles.sheet
        : isPanel
        ? styles.panel
        : styles.floating;

    const hasMessages = messages.length > 0;

    return (
        <div 
            ref={ref} 
            className={`${styles.chatContainer} ${containerVariantClass} ${isSheetCollapsed ? styles.sheetCollapsed : ''} ${isSheetMid ? styles.sheetMid : ''} ${containerClassName}`} 
            style={containerStyle}
        >
            {/* Handle Wrapper for sheet variant */}
            {isSheet && (
                <div 
                    className={styles.sheetHandleWrapper}
                    onClick={onHandleToggle}
                    onTouchStart={onHandleTouchStart}
                    onTouchMove={onHandleTouchMove}
                    onTouchEnd={onHandleTouchEnd}
                    aria-label={`Toggle panel: ${sheetState || ''}`}
                >
                    <div className={styles.sheetHandle} />
                </div>
            )}

            {/* Messages Area */}
            {(isPanel || (isSheet && isSheetExpanded)) && (
                <div className={styles.messagesArea}>
                    {!hasMessages ? (
                        <div className={styles.emptyState}>
                            <div className={styles.emptyIcon}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bot-icon lucide-bot"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>
                                </svg>
                            </div>
                            <p className={styles.emptyTitle}>Pathfinder AI</p>
                            <p className={styles.emptySubtitle}>Ask me about destinations, activities, or anything about Catanduanes</p>
                        </div>
                    ) : (
                        <div className={styles.messageList}>
                            {messages.map((msg, i) => (
                                <div 
                                    key={i} 
                                    className={`${styles.messageRow} ${msg.role === 'user' ? styles.userRow : styles.assistantRow}`}
                                >
                                    {msg.role === 'assistant' && (
                                        <div className={styles.avatar}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                                                <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                <path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                            </svg>
                                        </div>
                                    )}
                                    <div className={`${styles.bubble} ${msg.role === 'user' ? styles.userBubble : styles.assistantBubble} ${msg.isError ? styles.errorBubble : ''}`}>
                                        {msg.content}
                                    </div>
                                </div>
                            ))}

                            {loading && (
                                <div className={`${styles.messageRow} ${styles.assistantRow}`}>
                                    <div className={styles.avatar}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                                            <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                            <path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                        </svg>
                                    </div>
                                    <div className={`${styles.bubble} ${styles.assistantBubble}`}>
                                        <div className={styles.typingIndicator}>
                                            <span></span><span></span><span></span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div ref={messagesEndRef} />
                        </div>
                    )}
                </div>
            )}

            {/* Input Area */}
            <div className={`${styles.inputArea} ${isSheetExpanded ? styles.sheetInputRow : ''}`}>
                <form onSubmit={handleSubmit} className={styles.inputForm} onClick={handleExpand}>
                    <textarea
                        ref={textareaRef}
                        rows={1}
                        value={input}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        onFocus={handleExpand}
                        placeholder="Ask Pathfinder..."
                        className={styles.chatInput}
                        disabled={loading}
                    />
                    <button 
                        type="submit" 
                        className={`${styles.sendBtn} ${input.trim() && !loading ? styles.sendBtnActive : ''}`}
                        disabled={loading || !input.trim()}
                    >
                        {loading ? (
                            <svg className={styles.loadingSpinner} viewBox="0 0 24 24" fill="none">
                                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeDasharray="31.4" strokeDashoffset="10" strokeLinecap="round"/>
                            </svg>
                        ) : (
                            <svg className={styles.sendIcon} viewBox="0 0 24 24" fill="none">
                                <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                        )}
                    </button>
                </form>
                {isSheetExpanded && formAccessory && (
                    <div className={styles.sheetAccessory}>
                        {formAccessory}
                    </div>
                )}
            </div>

            {isSheet && children}
        </div>
    );
});

ChatBot.displayName = 'ChatBot';

export default ChatBot;