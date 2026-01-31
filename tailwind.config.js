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

    theme: {
        extend: {
            fontFamily: {
                sans: ['Figtree', ...defaultTheme.fontFamily.sans],
            },
        },
    },

    plugins: [forms, daisyui],

    daisyui: {
        themes: [
            {
                light: {
                    "primary": "#e67e22",
                    "primary-content": "#ffffff",
                    "secondary": "#3498db",
                    "secondary-content": "#ffffff",
                    "accent": "#9b59b6",
                    "accent-content": "#ffffff",
                    "neutral": "#2c3e50",
                    "neutral-content": "#ffffff",
                    "base-100": "#ffffff",
                    "base-200": "#f5f5f5",
                    "base-300": "#e0e0e0",
                    "base-content": "#1a1a1a",
                    "info": "#3498db",
                    "success": "#27ae60",
                    "warning": "#f39c12",
                    "error": "#e74c3c",
                },
                dark: {
                    "primary": "#e67e22",
                    "primary-content": "#ffffff",
                    "secondary": "#3498db",
                    "secondary-content": "#ffffff",
                    "accent": "#9b59b6",
                    "accent-content": "#ffffff",
                    "neutral": "#1a1a1a",
                    "neutral-content": "#ffffff",
                    "base-100": "#212121",
                    "base-200": "#1a1a1a",
                    "base-300": "#2d2d2d",
                    "base-content": "#f5f5f5",
                    "info": "#3498db",
                    "success": "#27ae60",
                    "warning": "#f39c12",
                    "error": "#e74c3c",
                },
            },
        ],
        darkTheme: "dark",
    },
};
