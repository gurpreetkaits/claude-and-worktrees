import defaultTheme from 'tailwindcss/defaultTheme';
import forms from '@tailwindcss/forms';
import daisyui from 'daisyui';

/** @type {import('tailwindcss').Config} */
export default {
    content: [
        './vendor/laravel/framework/src/Illuminate/Pagination/resources/views/*.blade.php',
        './storage/framework/views/*.php',
        './resources/views/**/*.blade.php',
        './resources/js/**/*.tsx',
    ],

    // Use class-based dark mode (toggled via 'dark' class on html element)
    darkMode: 'class',

    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'Figtree', ...defaultTheme.fontFamily.sans],
                mono: ['JetBrains Mono', ...defaultTheme.fontFamily.mono],
            },
        },
    },

    plugins: [forms, daisyui],

    daisyui: {
        themes: [
            {
                light: {
                    "primary": "#4b5563",           // gray-600
                    "primary-content": "#ffffff",
                    "secondary": "#6b7280",         // gray-500
                    "secondary-content": "#ffffff",
                    "accent": "#f97316",            // orange-500 for accents
                    "accent-content": "#ffffff",
                    "neutral": "#111827",           // gray-900
                    "neutral-content": "#f9fafb",   // gray-50
                    "base-100": "#ffffff",          // white
                    "base-200": "#f9fafb",          // gray-50
                    "base-300": "#f3f4f6",          // gray-100
                    "base-content": "#111827",      // gray-900
                    "info": "#3b82f6",              // blue-500
                    "info-content": "#ffffff",
                    "success": "#22c55e",           // green-500
                    "success-content": "#ffffff",
                    "warning": "#f59e0b",           // amber-500
                    "warning-content": "#ffffff",
                    "error": "#ef4444",             // red-500
                    "error-content": "#ffffff",
                },
                dark: {
                    "primary": "#9ca3af",           // gray-400
                    "primary-content": "#111827",
                    "secondary": "#6b7280",         // gray-500
                    "secondary-content": "#ffffff",
                    "accent": "#f97316",            // orange-500
                    "accent-content": "#ffffff",
                    "neutral": "#f9fafb",           // gray-50
                    "neutral-content": "#111827",
                    "base-100": "#111827",          // gray-900
                    "base-200": "#1f2937",          // gray-800
                    "base-300": "#374151",          // gray-700
                    "base-content": "#f9fafb",      // gray-50
                    "info": "#3b82f6",
                    "info-content": "#ffffff",
                    "success": "#22c55e",
                    "success-content": "#ffffff",
                    "warning": "#f59e0b",
                    "warning-content": "#ffffff",
                    "error": "#ef4444",
                    "error-content": "#ffffff",
                },
            },
        ],
        darkTheme: "dark",
    },
};
