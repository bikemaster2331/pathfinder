import { useState, useEffect } from 'react';
import styles from '../styles/itinerary_page/ChatBot.module.css';

export default function ChatBot({ onLocationResponse }) {
    const [input, setInput] = useState('');
    const [response, setResponse] = useState('');
    const [loading, setLoading] = useState(false);

    // --- NEW: Auto-Dismiss Logic ---
    useEffect(() => {
        if (response) {
            // Set a timer to clear the response after 10 seconds
            const timer = setTimeout(() => {
                setResponse('');
            }, 3000); // 5 seconds

            // Cleanup the timer if the component unmounts or response changes
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

    return (
        <div className={styles.chatContainer}>
            {/* Logic: Show response box if there is a response OR if loading (to show 'Thinking...') */}
            {(response || loading) && (
                <div className={styles.responseBox}>
                    {loading && !response ? (
                        <span style={{color: '#aaa'}}>Thinking...</span>
                    ) : (
                        <p>{response}</p>
                    )}
                </div>
            )}
            
            <form onSubmit={handleSubmit} className={styles.inputForm}>
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask Pathfinder... (e.g., 'cafes in virac')"
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
                        // A clean "Paper Plane" / Arrow SVG
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
        </div>
    );
}