# Cine-Stream

A Netflix-lite single-page movie explorer powered by the [TMDB API](https://developer.themoviedb.org/docs/authentication-application).

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a local env file:

```bash
cp .env.example .env
```

3. Set required and optional keys in `.env`:

```bash
VITE_TMDB_KEY=your_tmdb_v3_key
VITE_GEMINI_KEY=optional_gemini_key
```

> Never commit real secrets. `.env` is gitignored.

## Local development

```bash
npm run dev
```

Then open the local Vite URL (usually `http://localhost:5173`).

You can also set or override keys from the in-app settings dialog (gear icon); those values are stored only in browser `localStorage`.

## Production build

```bash
npm run build
```

## Features implemented

- Popular movies and TMDB search results in a responsive CSS grid
- 500ms debounced search
- IntersectionObserver infinite scroll with append-only pagination
- In-flight request cancellation/stale-response protection
- Poster placeholder when `poster_path` is missing
- Native `loading="lazy"` poster images
- LocalStorage-backed favorites with dedicated favorites view (`#/favorites`)
- Optional Mood Matcher:
  - Uses Gemini if `VITE_GEMINI_KEY` (or in-app override) is present
  - Falls back to a client-safe mood-to-title mapper when no LLM key is configured
- Accessible labels, semantic controls, status messaging, and responsive mobile/desktop layouts
