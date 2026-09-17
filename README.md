# Cine-Stream

A Netflix-lite single-page movie explorer powered by the [TMDB API](https://developer.themoviedb.org/docs/authentication-application).

## Run locally

Because this is a dependency-free static SPA, serve the repository with any static server (opening `index.html` directly may be blocked by browser CORS rules):

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`, click the gear icon, and add a TMDB v3 API key. A Gemini API key is optional and enables Mood Matcher. Keys are stored only in browser `localStorage`; do not commit them.

## Included architecture

- Popular movies and TMDB search results in a responsive CSS grid
- 500ms debounced search requests
- Intersection Observer infinite scroll with page-on-demand loading
- Native `loading="lazy"` poster assets
- LocalStorage-backed favorites and `#/favorites` route
- Optional Gemini mood-to-movie handoff into TMDB search
- Accessible labels, status announcements, empty/loading states, and mobile layout
