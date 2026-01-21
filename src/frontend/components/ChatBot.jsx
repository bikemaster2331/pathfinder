import { useState } from 'react';
import styles from '../styles/itinerary_page/ChatBot.module.css';

export default function ChatBot({ onLocationResponse }) {
    const [input, setInput] = useState('');
    const [response, setResponse] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!input.trim() || loading) return;

        setLoading(true);
        setResponse('Thinking...');

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

            // Send locations to parent (ItineraryPage -> Map)
            if (onLocationResponse && data.locations?.length > 0) {
                onLocationResponse(data.locations);
            }
            
            // Clear input on success (The only addition)
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
            {response && (
                <div className={styles.responseBox}>
                    <p>{response}</p>
                </div>
            )}
            
            <form onSubmit={handleSubmit} className={styles.inputForm}>
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask Pathfinder... (e.g., 'cafes nearby')"
                    className={styles.chatInput}
                    disabled={loading}
                />
                <button 
                    type="submit" 
                    className={styles.sendBtn}
                    disabled={loading || !input.trim()}
                >
                    {loading ? '...' : '→'}
                </button>
            </form>
        </div>
    );
}