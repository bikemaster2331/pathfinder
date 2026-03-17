import React, { useState, useEffect } from 'react';

const ThemeToggle = ({ className, iconLightClass, iconDarkClass }) => {
    const getInitialTheme = () => {
        if (typeof window === 'undefined') return 'light';
        const stored = window.localStorage.getItem('theme');
        if (stored === 'light' || stored === 'dark') return stored;
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        return prefersDark ? 'dark' : 'light';
    };

    const [theme, setTheme] = useState(getInitialTheme);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        window.localStorage.setItem('theme', theme);
        window.dispatchEvent(new Event('themechange'));
    }, [theme]);

    useEffect(() => {
        const handleThemeChange = () => {
            const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
            if (currentTheme !== theme) {
                setTheme(currentTheme);
            }
        };

        window.addEventListener('themechange', handleThemeChange);
        return () => window.removeEventListener('themechange', handleThemeChange);
    }, [theme]);

    const toggleTheme = (e) => {
        e.stopPropagation();
        setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
    };

    return (
        <button
            type="button"
            className={className}
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
            <svg 
                className={iconLightClass}
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
            >
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
            <svg 
                className={iconDarkClass} 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
            >
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                <path d="M19 4h.01" strokeWidth="3" />
            </svg>
        </button>
    );
};

export default ThemeToggle;
