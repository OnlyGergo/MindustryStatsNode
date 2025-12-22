export const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
};

export const formatDateTime = (date: Date) => {
    return date.toLocaleString();
};

/**
 * Format a Date object to a human-readable string
 * Examples: "Today 14:30", "Yesterday 09:15", "Dec 15, 2024 18:45"
 */
export const formatDateTimeHuman = (date: Date): string => {
    const now = new Date();
    const inputDate = new Date(date);
    
    // Check if same day
    const isToday = inputDate.toDateString() === now.toDateString();
    
    // Check if yesterday
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = inputDate.toDateString() === yesterday.toDateString();
    
    const timeStr = inputDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    if (isToday) {
        return `Today ${timeStr}`;
    } else if (isYesterday) {
        return `Yesterday ${timeStr}`;
    } else {
        // For older dates, show full date
        const dateStr = inputDate.toLocaleDateString([], { 
            month: 'short', 
            day: 'numeric',
            year: inputDate.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
        });
        return `${dateStr} ${timeStr}`;
    }
};

/**
 * Convert a 2-letter country code to a flag emoji
 */
export const countryCodeToFlag = (countryCode: string | null | undefined): string => {
    if (!countryCode || countryCode.length !== 2) {
        return '🌐'; // Globe emoji for unknown
    }

    const codePoints = countryCode
        .toUpperCase()
        .split('')
        .map((char) => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
};