/**
 * Centralized theme configuration for Mindustry Stats
 * This file contains all color, spacing, and styling constants
 * to make theming consistent and maintainable.
 */
import {FetchStatus} from "./hooks/useApi.ts";

// Primary brand colors
export const theme = {
    // Primary accent color (orange)
    primary: {
        50: 'rgb(255, 247, 237)',
        100: 'rgb(255, 237, 213)',
        200: 'rgb(254, 215, 170)',
        300: 'rgb(253, 186, 116)',
        400: 'rgb(251, 146, 60)',
        500: 'rgb(249, 115, 22)',    // Main orange
        600: 'rgb(234, 88, 12)',
        700: 'rgb(194, 65, 12)',
        800: 'rgb(154, 52, 18)',
        900: 'rgb(124, 45, 18)',
    },

    // Neutral colors (dark theme)
    neutral: {
        50: 'rgb(250, 250, 250)',
        100: 'rgb(245, 245, 245)',
        200: 'rgb(229, 229, 229)',
        300: 'rgb(212, 212, 212)',
        400: 'rgb(163, 163, 163)',
        500: 'rgb(115, 115, 115)',
        600: 'rgb(82, 82, 82)',
        700: 'rgb(64, 64, 64)',
        800: 'rgb(38, 38, 38)',
        900: 'rgb(23, 23, 23)',
        950: 'rgb(10, 10, 10)',
    },

    // Status colors
    status: {
        success: {
            bg: 'bg-green-500/20',
            text: 'text-green-400',
            border: 'border-green-500/30',
            dot: 'bg-green-400',
        },
        warning: {
            bg: 'bg-yellow-500/20',
            text: 'text-yellow-400',
            border: 'border-yellow-500/30',
            dot: 'bg-yellow-400',
        },
        error: {
            bg: 'bg-red-500/20',
            text: 'text-red-400',
            border: 'border-red-500/30',
            dot: 'bg-red-400',
        },
    },
} as const;

// Tailwind class presets for common components
export const classes = {
    // Card/Panel backgrounds
    card: {
        base: 'bg-neutral-800/30 backdrop-blur-md border border-neutral-700/50 rounded-xl',
        header: 'bg-neutral-800/40 backdrop-blur-md border-b border-neutral-700/50',
    },

    // Button variants
    button: {
        primary: 'bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 border border-orange-500/30 transition-colors',
        secondary: 'bg-neutral-700/50 hover:bg-neutral-600/50 text-gray-300 border border-neutral-600/50 transition-colors',
        ghost: 'hover:bg-neutral-700/30 text-gray-400 hover:text-gray-300 transition-colors',
    },

    // Input fields
    input: {
        base: 'bg-neutral-700/50 border border-neutral-600/50 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all',
    },

    // Text colors
    text: {
        primary: 'text-white',
        secondary: 'text-gray-300',
        muted: 'text-gray-400',
        accent: 'text-orange-400',
        highlight: 'text-orange-400 drop-shadow-[0_0_10px_rgba(249,115,22,0.3)]',
    },

    // Status badges
    badge: {
        online: 'bg-green-500/20 text-green-400 border-green-500/30',
        offline: 'bg-red-500/20 text-red-400 border-red-500/30',
        reconnecting: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    },

    // Change highlight (for history tables)
    highlight: {
        changed: 'text-orange-400 bg-orange-500/10',
        indicator: 'text-orange-400',
    },

    // Table styling
    table: {
        wrapper: 'overflow-x-auto rounded-lg border border-neutral-700/50 shadow-lg',
        header: 'bg-neutral-700/50',
        headerCell: 'text-left text-xs font-medium text-gray-300 uppercase tracking-wider',
        body: 'bg-neutral-800/30 divide-y divide-neutral-700/50',
        row: 'hover:bg-neutral-700/30 transition-colors',
    },

    // Pagination
    pagination: {
        button: 'rounded-lg border transition-colors',
        active: 'bg-neutral-700/50 text-gray-300 border-neutral-600/50 hover:bg-neutral-600/50',
        disabled: 'bg-neutral-700/30 text-gray-500 border-neutral-600/30 cursor-not-allowed',
    },
} as const;

// Connection status helpers
export const getConnectionStatusClasses = (status: FetchStatus) => {
    switch (status) {
        case 'success':
            return {
                dotColor: 'bg-green-400',
                tooltip: 'Connected',
            };
        case 'loading':
            return {
                dotColor: 'bg-yellow-400 animate-pulse',
                tooltip: 'Reconnecting...',
            };
        default:
            return {
                dotColor: 'bg-red-400',
                tooltip: 'Connection Error',
            };
    }
};

// Scrollbar colors (for CSS)
export const scrollbarColors = {
    track: 'transparent',
    thumb: 'rgba(249, 115, 22, 0.3)',      // Orange with transparency
    thumbHover: 'rgba(249, 115, 22, 0.5)',  // Brighter on hover
};

export default theme;
