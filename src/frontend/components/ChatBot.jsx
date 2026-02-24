import { useState, useEffect, useRef, forwardRef } from 'react';
import Keyboard from 'react-simple-keyboard';
import 'react-simple-keyboard/build/css/index.css';
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
    const [modalInput, setModalInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [showKeyboard, setShowKeyboard] = useState(false);
    const showKeyboardRef = useRef(false);
    useEffect(() => { showKeyboardRef.current = showKeyboard; }, [showKeyboard]);
    const [layoutName, setLayoutName] = useState("default");
    const messagesEndRef = useRef(null);
    const textareaRef = useRef(null);
    const modalTextareaRef = useRef(null);
    const keyboardRef = useRef(null);
    const modalContainerRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, loading, children]);

    // Handle clicking outside to dismiss the keyboard
    useEffect(() => {
        if (!showKeyboard) return;

        const handleClickOutside = (e) => {
            // Check if the click is inside the keyboard boundaries
            if (keyboardRef.current && keyboardRef.current.keyboardDOM && keyboardRef.current.keyboardDOM.contains(e.target)) {
                return;
            }
            // Check if the click is on the textarea itself, we don't want to dismiss and immediately re-open
            if (textareaRef.current && textareaRef.current.contains(e.target)) {
                return;
            }
            // Check if the click is inside the modal container
            if (modalContainerRef.current && modalContainerRef.current.contains(e.target)) {
                return;
            }

            setShowKeyboard(false);
        };

        // Use capture phase to intercept as early as possible
        document.addEventListener('mousedown', handleClickOutside, { capture: true });
        document.addEventListener('touchstart', handleClickOutside, { capture: true });

        return () => {
            document.removeEventListener('mousedown', handleClickOutside, { capture: true });
            document.removeEventListener('touchstart', handleClickOutside, { capture: true });
        };
    }, [showKeyboard]);

    const handleInputChange = (e) => {
        const val = e.target.value;
        setInput(val);
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
        }
    };

    const handleModalInputChange = (e) => {
        const val = e.target.value;
        setModalInput(val);
        if (keyboardRef.current) {
            keyboardRef.current.setInput(val);
        }
    };

    const onChangeKeyboard = (inputVal) => {
        setModalInput(inputVal);
    };

    const onKeyPress = (button) => {
        if (button === "{shift}") {
            setLayoutName(layoutName === "default" ? "shift" : "default");
        }
        if (button === "{numbers}") {
            setLayoutName("numbers");
        }
        if (button === "{default}") {
            setLayoutName("default");
        }
        if (button === "{enter}" && !loading && modalInput.trim()) {
            handleModalSubmit({ preventDefault: () => { } });
            setLayoutName("default"); // Option to revert to default on send
        }
    };

    const submitMessage = async (userMessage) => {
        if (!userMessage || loading || !setMessages) return;

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

    const handleSubmit = (e) => {
        if (e && e.preventDefault) e.preventDefault();
        const userMessage = input.trim();
        if (!userMessage || loading) return;

        setInput('');
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
        submitMessage(userMessage);
    };

    const handleModalSubmit = (e) => {
        if (e && e.preventDefault) e.preventDefault();
        const userMessage = modalInput.trim();
        if (!userMessage || loading) return;

        setModalInput('');
        if (keyboardRef.current) {
            keyboardRef.current.clearInput();
        }
        setShowKeyboard(false);

        submitMessage(userMessage);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    const handleModalKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleModalSubmit(e);
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
        <>
            <div
                ref={ref}
                className={`${styles.chatContainer} ${containerVariantClass} ${isSheetCollapsed ? styles.sheetCollapsed : ''} ${isSheetMid ? styles.sheetMid : ''} ${showKeyboard ? styles.keyboardActive : ''} ${containerClassName}`}
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

                {(isPanel || (isSheet && isSheetExpanded) || !isSheet) && (
                    <div className={styles.messagesArea}>
                        {!hasMessages && !(isPanel && children) ? (
                            <div className={styles.emptyState}>
                                <div className={styles.emptyIcon}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8V4H8" /><rect width="16" height="12" x="4" y="8" rx="2" /><path d="M2 14h2" /><path d="M20 14h2" /><path d="M15 13v2" /><path d="M9 13v2" /></svg>
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
                    <form onSubmit={handleSubmit} className={styles.inputForm}>
                        <textarea
                            ref={textareaRef}
                            rows={1}
                            value={input}
                            onChange={handleInputChange}
                            onKeyDown={handleKeyDown}
                            placeholder="Ask Pathfinder..."
                            className={styles.chatInput}
                            disabled={loading}
                            readOnly={true} /* Prevent native OS keyboard from popping up on touch devices */
                            onClick={() => setShowKeyboard(true)}
                        />
                        <button
                            type="submit"
                            className={`${styles.sendBtn} ${input.trim() && !loading ? styles.sendBtnActive : ''}`}
                            disabled={loading || !input.trim()}
                        >
                            {loading ? (
                                <svg className={styles.loadingSpinner} viewBox="0 0 24 24" fill="none">
                                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeDasharray="31.4" strokeDashoffset="10" strokeLinecap="round" />
                                </svg>
                            ) : (
                                <svg className={styles.sendIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" />
                                    <path d="m21.854 2.147-10.94 10.939" />
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

            {showKeyboard && (
                <div ref={modalContainerRef} className={styles.keyboardInputModal}>
                    <form onSubmit={handleModalSubmit} className={styles.inputForm}>
                        <textarea
                            ref={modalTextareaRef}
                            rows={1}
                            value={modalInput}
                            onChange={handleModalInputChange}
                            onKeyDown={handleModalKeyDown}
                            placeholder="Ask Pathfinder..."
                            className={`${styles.chatInput} ${styles.modalChatInput}`}
                            disabled={loading}
                            readOnly={true} /* Prevent native OS keyboard from popping up on touch devices */
                        />
                        <button
                            type="submit"
                            className={`${styles.sendBtn} ${modalInput.trim() && !loading ? styles.sendBtnActive : ''}`}
                            disabled={loading || !modalInput.trim()}
                        >
                            {loading ? (
                                <svg className={styles.loadingSpinner} viewBox="0 0 24 24" fill="none">
                                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeDasharray="31.4" strokeDashoffset="10" strokeLinecap="round" />
                                </svg>
                            ) : (
                                <svg className={styles.sendIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" />
                                    <path d="m21.854 2.147-10.94 10.939" />
                                </svg>
                            )}
                        </button>
                    </form>
                </div>
            )}

            {showKeyboard && (
                <div className={styles.keyboardFixedContainer}>
                    <Keyboard
                        keyboardRef={r => (keyboardRef.current = r)}
                        layoutName={layoutName}
                        onChange={onChangeKeyboard}
                        onKeyPress={onKeyPress}
                        theme={"hg-theme-default hg-layout-default squeekboardTheme"}
                        layout={{
                            default: [
                                "q w e r t y u i o p",
                                "a s d f g h j k l",
                                "{shift} z x c v b n m {bksp}",
                                "{numbers} {space} . {enter}"
                            ],
                            shift: [
                                "Q W E R T Y U I O P",
                                "A S D F G H J K L",
                                "{shift} Z X C V B N M {bksp}",
                                "{numbers} {space} . {enter}"
                            ],
                            numbers: [
                                "1 2 3 4 5 6 7 8 9 0",
                                "@ # $ % & * - + ( )",
                                "{shift} ! \" ' : ; / ? {bksp}",
                                "{default} {space} , {enter}"
                            ]
                        }}
                        display={{
                            "{bksp}": "⌫",
                            "{enter}": "↵",
                            "{shift}": "⬆",
                            "{space}": " ",
                            "{numbers}": "123",
                            "{default}": "ABC"
                        }}
                        buttonTheme={[
                            {
                                class: "hg-wide-key",
                                buttons: "{shift} {bksp} {numbers} {default} {enter}"
                            },
                            {
                                class: "hg-space-key",
                                buttons: "{space}"
                            }
                        ]}
                        physicalKeyboardHighlight={true}
                    />
                </div>
            )}
        </>
    );
});

ChatBot.displayName = 'ChatBot';

export default ChatBot;
