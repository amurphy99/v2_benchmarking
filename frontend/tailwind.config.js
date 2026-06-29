/*
Tailwind v4 reads theme tokens from `src/index.css` via `@theme`, not from
this file. Kept for content-path discovery only (in case any tooling looks
for it). Theme customization lives in src/index.css.
*/
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: { extend: {} },
  plugins: [],
}
