import { useState, useEffect, useRef, forwardRef } from 'react';
import Keyboard from 'react-simple-keyboard';
import 'react-simple-keyboard/build/css/index.css';
import styles from '../styles/components/ChatBot.module.css';

const ChatBot = forwardRef(({
    messages = [],
    setMessages,
    onLocationResponse,
    activePin = null,
    setActivePin,
    variant = 'floating',
    onKeyboardChange,
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
    useEffect(() => { 
        showKeyboardRef.current = showKeyboard; 
        if (onKeyboardChange) {
            onKeyboardChange(showKeyboard);
        }
    }, [showKeyboard, onKeyboardChange]);
    const [isRecording, setIsRecording] = useState(false);
    const [speechError, setSpeechError] = useState('');
    const [isKeyboardHovered, setIsKeyboardHovered] = useState(false);
    const [layoutName, setLayoutName] = useState("default");
    const messagesEndRef = useRef(null);
    const textareaRef = useRef(null);
    const modalTextareaRef = useRef(null);
    const keyboardRef = useRef(null);
    const recognitionRef = useRef(null);
    const modalContainerRef = useRef(null);
    const submitLockRef = useRef(false);

    // Focus the modal container so it can catch physical keystrokes
    useEffect(() => {
        if (showKeyboard && modalContainerRef.current) {
            modalContainerRef.current.focus();
        }
    }, [showKeyboard]);

    // Handle physical keyboard typing when modal is active
    const handleGlobalKeyDown = (e) => {
        if (!showKeyboard) return;
        if (e.defaultPrevented) return;

        // Don't capture if user is holding Ctrl/Cmd (shortcuts)
        if (e.ctrlKey || e.metaKey || e.altKey) return;

        // Handle special keys
        if (e.key === 'Escape') {
            setShowKeyboard(false);
            return;
        }

        if (e.key === 'Enter') {
            e.preventDefault();
            handleModalSubmit(e);
            return;
        }

        if (e.key === 'Backspace') {
            e.preventDefault();
            setModalInput(prev => {
                const newVal = prev.slice(0, -1);
                if (keyboardRef.current) keyboardRef.current.setInput(newVal);
                setInput(newVal);
                return newVal;
            });
            return;
        }

        // Only capture printable characters (length 1)
        if (e.key.length === 1) {
            e.preventDefault();
            setModalInput(prev => {
                const newVal = prev + e.key;
                if (keyboardRef.current) keyboardRef.current.setInput(newVal);
                setInput(newVal);
                return newVal;
            });

            if (modalTextareaRef.current) {
                setTimeout(() => {
                    modalTextareaRef.current.style.height = 'auto';
                    modalTextareaRef.current.style.height = Math.min(modalTextareaRef.current.scrollHeight, 200) + 'px';
                }, 0);
            }
        }
    };

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

    useEffect(() => {
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = false;
            recognitionRef.current.interimResults = false;
            recognitionRef.current.lang = 'en-US';

            recognitionRef.current.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                if (showKeyboardRef.current) {
                    setModalInput(prev => {
                        const newVal = prev + (prev.endsWith(' ') ? '' : ' ') + transcript;
                        if (keyboardRef.current) keyboardRef.current.setInput(newVal);
                        return newVal;
                    });
                    if (modalTextareaRef.current) {
                        modalTextareaRef.current.style.height = 'auto';
                        modalTextareaRef.current.style.height = Math.min(modalTextareaRef.current.scrollHeight, 200) + 'px';
                    }
                } else {
                    setInput(prev => {
                        const newVal = prev + (prev.endsWith(' ') ? '' : ' ') + transcript;
                        return newVal;
                    });
                    if (textareaRef.current) {
                        textareaRef.current.style.height = 'auto';
                        textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
                    }
                }
            };

            recognitionRef.current.onerror = (event) => {
                console.error("Speech recognition error", event.error);
                setSpeechError(event.error);
                setIsRecording(false);
            };

            recognitionRef.current.onend = () => {
                setIsRecording(false);
            };
        } else {
            setSpeechError("Speech recognition not supported");
        }

        return () => {
            if (recognitionRef.current) recognitionRef.current.abort();
        };
    }, []);

    const toggleRecording = (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (isRecording) {
            recognitionRef.current?.stop();
            setIsRecording(false);
        } else {
            setSpeechError('');
            try {
                recognitionRef.current?.start();
                setIsRecording(true);
            } catch (err) {
                console.error("Failed to start recording:", err);
            }
        }
    };

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
        setInput(val);
        if (keyboardRef.current) {
            keyboardRef.current.setInput(val);
        }
        if (modalTextareaRef.current) {
            modalTextareaRef.current.style.height = 'auto';
            modalTextareaRef.current.style.height = Math.min(modalTextareaRef.current.scrollHeight, 200) + 'px';
        }
    };

    const onChangeKeyboard = (inputVal) => {
        setModalInput(inputVal);
        setInput(inputVal);
        if (modalTextareaRef.current) {
            modalTextareaRef.current.style.height = 'auto';
            modalTextareaRef.current.style.height = Math.min(modalTextareaRef.current.scrollHeight, 200) + 'px';
        }
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
        if (!userMessage || loading || !setMessages || submitLockRef.current) return;

        submitLockRef.current = true;
        setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
        setLoading(true);

        try {
            let baseUrl = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
            if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);

            const res = await fetch(`${baseUrl}/ask`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question: userMessage,
                    active_pin: activePin || null
                })
            });

            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(`Server Error ${res.status}: ${errorText}`);
            }

            const data = await res.json();

            setMessages(prev => [...prev, { role: 'assistant', content: data.answer }]);

            // -------------- AUTO-PIN LOGIC --------------
            if (data.locations && data.locations.length === 1 && setActivePin) {
                setActivePin(data.locations[0].name);
            }

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
            submitLockRef.current = false;
        }
    };

    const handleSubmit = (e) => {
        if (e && e.preventDefault) e.preventDefault();
        const userMessage = input.trim();
        if (!userMessage || loading) return;

        setInput('');
        setModalInput(''); // Clear modal input too
        if (keyboardRef.current) keyboardRef.current.clearInput();
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
        submitMessage(userMessage);
    };

    const handleModalSubmit = (e) => {
        if (e && e.preventDefault) e.preventDefault();
        const userMessage = modalInput.trim();
        if (!userMessage || loading) return;

        setModalInput('');
        setInput(''); // Clear main input too
        if (keyboardRef.current) {
            keyboardRef.current.clearInput();
        }
        if (modalTextareaRef.current) modalTextareaRef.current.style.height = 'auto';
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

    const renderActivePinPill = () => {
        if (!activePin) return null;
        return (
            <div className={styles.activePinPill}>
                <span>{activePin}</span>
                <button
                    type="button"
                    className={styles.removePillBtn}
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (setActivePin) setActivePin(null);
                    }}
                    aria-label="Remove pin"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>
        );
    };

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
                        <button
                            type="button"
                            onClick={toggleRecording}
                            aria-label={isRecording ? "Stop recording" : "Start recording"}
                            title={speechError || "Voice Input"}
                            style={{
                                display: 'none', /* Hidden but functionality kept intact */
                                background: 'none',
                                border: 'none',
                                color: isRecording ? '#ef4444' : 'inherit',
                                cursor: 'pointer',
                                padding: '8px',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'color 0.2s',
                                opacity: speechError ? 0.5 : 1
                            }}
                        >
                            {isRecording ? (
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="12" height="12" x="6" y="6" rx="2" /></svg>
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" x2="12" y1="19" y2="22" /></svg>
                            )}
                        </button>
                        
                        {renderActivePinPill()}

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
                            onClick={() => {
                                setModalInput(input);
                                if (keyboardRef.current) keyboardRef.current.setInput(input);
                                setShowKeyboard(true);
                            }}
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
                    </form >
                    {isSheetExpanded && formAccessory && (
                        <div className={styles.sheetAccessory}>
                            {formAccessory}
                        </div>
                    )}
                </div >

                {isSheet && children}
            </div >

            {showKeyboard && (
                <>
                    <div className={styles.keyboardModalOverlay} aria-hidden="true" onClick={() => setShowKeyboard(false)} />
                    <div
                        ref={modalContainerRef}
                        className={styles.keyboardInputModal}
                        tabIndex="-1"
                        onKeyDown={handleGlobalKeyDown}
                        style={{ outline: 'none' }}
                    >
                        <form onSubmit={handleModalSubmit} className={styles.inputForm}>
                            <button
                                type="button"
                                onClick={toggleRecording}
                                aria-label={isRecording ? "Stop recording" : "Start recording"}
                                title={speechError || "Voice Input"}
                                style={{
                                    display: 'none', /* Hidden but functionality kept intact */
                                    background: 'none',
                                    border: 'none',
                                    color: isRecording ? '#ef4444' : 'inherit',
                                    cursor: 'pointer',
                                    padding: '8px',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'color 0.2s',
                                    opacity: speechError ? 0.5 : 1
                                }}
                            >
                                {isRecording ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="12" height="12" x="6" y="6" rx="2" /></svg>
                                ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" x2="12" y1="19" y2="22" /></svg>
                                )}
                            </button>

                            {renderActivePinPill()}

                            <textarea
                                ref={modalTextareaRef}
                                rows={1}
                                value={modalInput}
                                onChange={handleModalInputChange}
                                onKeyDown={handleModalKeyDown}
                                placeholder="Ask Pathfinder..."
                                className={`${styles.chatInput} ${styles.modalChatInput}`}
                                disabled={loading}
                                readOnly={true} /* Prevent native OS keyboard from popping up */
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
                </>
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
                                "{numbers} {global} {space} . {enter}"
                            ],
                            shift: [
                                "Q W E R T Y U I O P",
                                "A S D F G H J K L",
                                "{shift} Z X C V B N M {bksp}",
                                "{numbers} {global} {space} . {enter}"
                            ],
                            numbers: [
                                "1 2 3 4 5 6 7 8 9 0",
                                "@ # $ % & * - + ( )",
                                "{shift} ! \" ' : ; / ? {bksp}",
                                "{default} {global} {space} , {enter}"
                            ]
                        }}
                        display={{
                            "{bksp}": "⌫",
                            "{enter}": "↵",
                            "{shift}": "⬆",
                            "{space}": " ",
                            "{numbers}": "123",
                            "{default}": "ABC",
                            "{global}": "🌐"
                        }}
                        buttonTheme={[
                            {
                                class: "hg-wide-key",
                                buttons: "{shift} {bksp} {numbers} {default} {enter} {global}"
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
