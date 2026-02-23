import { useState, useEffect, useRef, forwardRef } from 'react';
import styles from '../styles/itinerary_page/ChatBot.module.css';

const ChatBot = forwardRef(({ 
    messages = [], 
    setMessages,
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
    children // We keep this for the mobile PreferenceCard inject, but stop using it for the preview box
}, ref) => {
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef(null);
    const textareaRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, loading, children]);

    const handleInputChange = (e) => {
        setInput(e.target.value);
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!input.trim() || loading || !setMessages) return;

        const userMessage = input.trim();
        setInput('');
        if (textareaRef.current) textareaRef.current.style.height = 'auto';

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

            {(isPanel || (isSheet && isSheetExpanded)) && (
                <div className={styles.messagesArea}>
                    {!hasMessages && !(isPanel && children) ? (
                        <div className={styles.emptyState}>
                            <div className={styles.emptyIcon}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>
                            </div>
                            <p className={styles.emptyTitle}>Pathfinder AI</p>
                            <p className={styles.emptySubtitle}>Ask me about destinations, activities, or anything about Catanduanes</p>
                        </div>
                    ) : (
                        <div className={styles.messageList}>
                            {messages.map((msg, i) => {
                                // NEW LOGIC: Render dynamic widget components directly in the flow
                                if (msg.role === 'widget') {
                                    return (
                                        <div key={i} className={`${styles.messageRow} ${styles.assistantRow} ${styles.inlinePanelRow}`}>
                                            <div className={styles.inlinePanelCard}>
                                                {msg.content}
                                            </div>
                                        </div>
                                    );
                                }

                                return (
                                    <div 
                                        key={i} 
                                        className={`${styles.messageRow} ${msg.role === 'user' ? styles.userRow : styles.assistantRow}`}
                                    >
                                        <div className={`${styles.bubble} ${msg.role === 'user' ? styles.userBubble : styles.assistantBubble} ${msg.isError ? styles.errorBubble : ''}`}>
                                            {msg.content}
                                        </div>
                                    </div>
                                );
                            })}

                            {loading && (
                                <div className={`${styles.messageRow} ${styles.assistantRow}`}>
                                    <div className={`${styles.bubble} ${styles.assistantBubble}`}>
                                        <div className={styles.typingIndicator}>
                                            <span></span><span></span><span></span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {isPanel && children && (
                                <div className={`${styles.messageRow} ${styles.assistantRow} ${styles.inlinePanelRow}`}>
                                    <div className={styles.inlinePanelCard}>
                                        {children}
                                    </div>
                                </div>
                            )}

                            <div ref={messagesEndRef} />
                        </div>
                    )}
                </div>
            )}

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
                            <svg className={styles.sendIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/>
                                <path d="m21.854 2.147-10.94 10.939"/>
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
