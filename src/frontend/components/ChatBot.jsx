import { useState, useEffect, forwardRef } from 'react';
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
    const [response, setResponse] = useState('');
    const [loading, setLoading] = useState(false);

    // --- Auto-Dismiss Logic ---
    useEffect(() => {
        if (response) {
            // Set a timer to clear the response after 3 seconds
            const timer = setTimeout(() => {
                setResponse('');
            }, 3000); 

            return () => clearTimeout(timer);
        }
    }, [response]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!input.trim() || loading) return;

        setLoading(true);
        
        try {
            const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
            const res = await fetch(`${API_BASE}/ask`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: input })
            });

            if (!res.ok) throw new Error('Request failed');

            const data = await res.json();
            setResponse(data.answer);

            if (onLocationResponse && data.locations?.length > 0) {
                onLocationResponse(data.locations);
            }
            
            setInput('');

        } catch (error) {
            console.error('Chat error:', error);
            setResponse('Sorry, something went wrong. Check if the backend is running!');
        } finally {
            setLoading(false);
        }
    };

    const handleExpand = () => {
        if (onExpand) onExpand();
    };

    const isSheetCollapsed = variant === 'sheet' && sheetState === 'collapsed';
    const isSheetMid = variant === 'sheet' && sheetState === 'mid';
    const isSheetExpanded = variant === 'sheet' && sheetState !== 'collapsed';

    return (
        <div 
            ref={ref} 
            className={`${styles.chatContainer} ${variant === 'sheet' ? styles.sheet : styles.floating} ${isSheetCollapsed ? styles.sheetCollapsed : ''} ${isSheetMid ? styles.sheetMid : ''} ${containerClassName}`} 
            style={containerStyle}
        >
            
            {/* Handle Wrapper (Top of stack) */}
            {variant === 'sheet' && (
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

            {/* Response Box */}
            {(response || loading) && (
                <div className={styles.responseBox}>
                    {loading && !response ? (
                        <span style={{color: '#aaa'}}>Thinking...</span>
                    ) : (
                        <p>{response}</p>
                    )}
                </div>
            )}
            
            {/* Input Row */}
            <div className={isSheetExpanded ? styles.sheetInputRow : ''}>
                <form onSubmit={handleSubmit} className={styles.inputForm} onClick={handleExpand}>
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onFocus={handleExpand}
                        placeholder="Ask Pathfinder"
                        className={styles.chatInput}
                        disabled={loading}
                    />
                    <button 
                        type="submit" 
                        className={styles.sendBtn}
                        disabled={loading || !input.trim()}
                    >
                        {loading ? (
                            <div className={styles.loadingDots}>
                                <div className={styles.dot}></div>
                                <div className={styles.dot}></div>
                                <div className={styles.dot}></div>
                            </div>
                        ) : (
                            // Send Icon
                            <svg 
                                className={styles.sendIcon} 
                                viewBox="0 0 24 24" 
                                strokeLinecap="round" 
                                strokeLinejoin="round"
                            >
                                <line x1="22" y1="2" x2="11" y2="13"></line>
                                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
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
            {variant === 'sheet' && children}
        </div>
    );
});

ChatBot.displayName = 'ChatBot';

export default ChatBot;