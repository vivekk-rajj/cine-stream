const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';
const ENV = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};
const ENV_KEY_MAP = {
  'tmdb-key': 'VITE_TMDB_KEY',
  'gemini-key': 'VITE_GEMINI_KEY',
};

const state = {
  page: 0,
  totalPages: 1,
  query: '',
  loading: false,
  favorites: JSON.parse(localStorage.getItem('cine-stream-favorites') || '[]'),
  debounceTimer: null,
  requestId: 0,
  controller: null,
};

const $ = (selector) => document.querySelector(selector);
const grid = $('#movie-grid');

function key(name) {
  const localValue = localStorage.getItem(`cine-stream-${name}`);
  if (localValue) return localValue;
  const envKey = ENV_KEY_MAP[name];
  const envValue = envKey ? ENV[envKey] : '';
  return typeof envValue === 'string' ? envValue.trim() : '';
}

function setStatus(message = '') {
  $('#status-message').textContent = message;
}

function setLoading(value) {
  state.loading = value;
  $('#loading').hidden = !value;
}

function updateCount() {
  $('#favorite-count').textContent = state.favorites.length;
}

function saveFavorites() {
  localStorage.setItem('cine-stream-favorites', JSON.stringify(state.favorites));
  updateCount();
}

function year(date) {
  return date ? date.slice(0, 4) : '—';
}

function poster(movie) {
  if (!movie.poster_path) {
    return 'data:image/svg+xml,' + encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="500" height="750">
        <rect width="100%" height="100%" fill="#20242d"/>
        <text x="50%" y="50%" fill="#8b909d" text-anchor="middle" font-family="sans-serif" font-size="22">NO POSTER</text>
      </svg>
    `);
  }
  return `${IMAGE_BASE}${movie.poster_path}`;
}

function sanitizeMovieTitle(title) {
  return String(title || '')
    .replace(/```/g, '')
    .replace(/\r?\n.*$/s, '')
    .replace(/^\s*[-•]\s*/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function normalizeRoute() {
  const hash = location.hash.replace(/^#/, '');
  if (hash.startsWith('/')) return hash;
  return location.pathname === '/favorites' ? '/favorites' : '/home';
}

function route() {
  const favoritesRoute = normalizeRoute() === '/favorites';
  document.querySelectorAll('[data-route]').forEach((link) => {
    link.classList.toggle('active', link.dataset.route === (favoritesRoute ? 'favorites' : 'home'));
  });

  if (favoritesRoute) {
    state.query = '';
    renderMovies(state.favorites, false, true);
    $('#catalog-title').textContent = 'My favorites';
    $('#results-label').textContent = `${state.favorites.length} saved`;
    return;
  }

  if (!state.page || state.query || !grid.children.length) {
    loadMovies({ reset: true });
  }
}

async function tmdb(path, params = {}, signal) {
  const apiKey = key('tmdb-key');

  if (apiKey) {
    const url = new URL(TMDB_BASE + path);
    Object.entries({ api_key: apiKey, language: 'en-US', ...params }).forEach(([keyName, value]) => {
      url.searchParams.set(keyName, value);
    });

    const response = await fetch(url, { signal });
    if (!response.ok) {
      throw new Error(`TMDB request failed (${response.status}). Check your API key.`);
    }

    return response.json();
  }

  $('#settings-dialog').showModal();
  throw new Error('Set VITE_TMDB_KEY in .env (or add TMDB key in settings) to load movies.');
}

function renderMovies(movies, append = false, favoritesMode = false) {
  if (!append) grid.innerHTML = '';

  if (!favoritesMode && !movies.length && !append) {
    $('#empty-state').hidden = false;
    return;
  }

  $('#empty-state').hidden = movies.length > 0 || append || favoritesMode;

  movies.forEach((movie, index) => {
    if (!movie || !movie.id) return;

    const saved = state.favorites.some((item) => item.id === movie.id);
    const card = document.createElement('article');
    card.className = 'movie-card';
    card.style.animationDelay = `${Math.min(index * 25, 250)}ms`;

    card.innerHTML = `
      <div class="poster">
        <button type="button" class="favorite ${saved ? 'saved' : ''}" aria-pressed="${saved}" aria-label="${saved ? 'Remove' : 'Add'} ${movie.title} ${saved ? 'from' : 'to'} favorites">${saved ? '♥' : '♡'}</button>
        <img loading="lazy" src="${poster(movie)}" alt="${movie.title || 'Movie'} poster" />
      </div>
      <h3 class="movie-title" title="${movie.title || 'Untitled'}">${movie.title || 'Untitled'}</h3>
      <div class="movie-meta">
        <span>${year(movie.release_date || movie.Year || '')}</span>
        <span class="rating">★ ${movie.vote_average ? Number(movie.vote_average).toFixed(1) : '—'}</span>
      </div>
    `;

    const favoriteButton = card.querySelector('.favorite');
    favoriteButton.addEventListener('click', () => toggleFavorite(movie, favoriteButton));
    grid.appendChild(card);
  });
}

function toggleFavorite(movie, button) {
  const index = state.favorites.findIndex((item) => item.id === movie.id);

  if (index === -1) {
    state.favorites.push(movie);
    button.classList.add('saved');
    button.textContent = '♥';
    button.setAttribute('aria-pressed', 'true');
    button.setAttribute('aria-label', `Remove ${movie.title} from favorites`);
  } else {
    state.favorites.splice(index, 1);
    button.classList.remove('saved');
    button.textContent = '♡';
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', `Add ${movie.title} to favorites`);
  }

  saveFavorites();

  if (normalizeRoute() === '/favorites') {
    route();
  }
}

async function loadMovies({ reset = false } = {}) {
  if (reset && state.controller) {
    state.controller.abort();
    state.controller = null;
    state.loading = false;
  }

  if (state.loading || (!reset && state.page >= state.totalPages)) return;

  if (reset) {
    state.page = 0;
    state.totalPages = 1;
    grid.innerHTML = '';
    $('#empty-state').hidden = true;
  }

  setLoading(true);
  setStatus('');
  const requestId = ++state.requestId;
  const controller = new AbortController();
  state.controller = controller;

  try {
    const query = state.query.trim();
    const nextPage = state.page + 1;
    const data = query
      ? await tmdb('/search/movie', { query, page: nextPage, include_adult: false }, controller.signal)
      : await tmdb('/movie/popular', { page: nextPage }, controller.signal);

    if (requestId !== state.requestId) return;

    state.page = data.page || state.page + 1;
    state.totalPages = Math.min(data.total_pages || 1, 500);

    const results = data.results || [];
    renderMovies(results, state.page > 1, false);

    $('#catalog-title').textContent = query ? `Results for “${query}”` : 'Popular this week';
    $('#results-label').textContent = query ? `${(data.total_results || results.length).toLocaleString()} movies` : '';

    if (!results.length) {
      $('#empty-state').hidden = false;
    }
  } catch (error) {
    if (error.name === 'AbortError') return;
    setStatus(error.message);
  } finally {
    if (state.controller === controller) {
      state.controller = null;
    }
    if (requestId === state.requestId) {
      setLoading(false);
    }
  }
}

function scheduleSearch(value) {
  clearTimeout(state.debounceTimer);
  const trimmed = value.trim();

  if (!trimmed) {
    state.query = '';
    if (normalizeRoute() !== '/favorites') {
      loadMovies({ reset: true });
    }
    return;
  }

  state.debounceTimer = setTimeout(() => {
    if (normalizeRoute() !== '/favorites') {
      state.query = trimmed;
      loadMovies({ reset: true });
    }
  }, 500);
}

$('#search-input').addEventListener('input', (event) => {
  scheduleSearch(event.target.value);
});

$('#search-form').addEventListener('submit', (event) => {
  event.preventDefault();
  clearTimeout(state.debounceTimer);
  state.query = $('#search-input').value.trim();
  if (state.query) {
    loadMovies({ reset: true });
  } else {
    loadMovies({ reset: true });
  }
});

$('#reset-button').addEventListener('click', () => {
  state.query = '';
  $('#search-input').value = '';
  location.hash = '#/home';
  loadMovies({ reset: true });
});

async function moodMatch(prompt) {
  const fallbackCatalog = [
    { keyword: /sad|down|cry|melancholy|lonely/, title: 'The Secret Life of Walter Mitty' },
    { keyword: /action|adrenaline|thrill|intense/, title: 'Mad Max: Fury Road' },
    { keyword: /romance|love|date|heart/, title: 'La La Land' },
    { keyword: /family|kids|warm|comfort/, title: 'Paddington 2' },
    { keyword: /scary|horror|dark|tense/, title: 'A Quiet Place' },
    { keyword: /funny|comedy|laugh|light/, title: 'The Grand Budapest Hotel' },
  ];
  const fallback = fallbackCatalog.find((item) => item.keyword.test(prompt.toLowerCase()))?.title || 'Inception';
  const geminiKey = key('gemini-key');
  if (!geminiKey) {
    const fallbackMessage = `Mood Matcher fallback picked “${fallback}”. Add VITE_GEMINI_KEY (optional) for AI suggestions.`;
    state.query = fallback;
    $('#search-input').value = fallback;
    $('#mood-input').value = '';
    loadMovies({ reset: true });
    setStatus(fallbackMessage);
    return;
  }

  setStatus('Finding your mood match…');

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Return only one real movie title and nothing else. Match this mood: ${prompt}`,
          }],
        }],
      }),
    });

    if (!response.ok) throw new Error('Mood Matcher could not reach Gemini.');

    const data = await response.json();
    const title = sanitizeMovieTitle(data?.candidates?.[0]?.content?.parts?.[0]?.text || '');

    if (!title) throw new Error('No mood match found.');

    state.query = title;
    $('#search-input').value = title;
    $('#mood-input').value = '';
    loadMovies({ reset: true });
  } catch (error) {
    const fallbackMessage = `${error.message} Using fallback title “${fallback}”.`;
    state.query = fallback;
    $('#search-input').value = fallback;
    $('#mood-input').value = '';
    loadMovies({ reset: true });
    setStatus(fallbackMessage);
  }
}

$('#mood-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const prompt = $('#mood-input').value.trim();
  if (prompt) moodMatch(prompt);
});

const observer = new IntersectionObserver(
  (entries) => {
    if (entries[0].isIntersecting && normalizeRoute() !== '/favorites') {
      loadMovies();
    }
  },
  { rootMargin: '500px' }
);

observer.observe($('#sentinel'));

$('#settings-button').addEventListener('click', () => {
  $('#tmdb-key').value = key('tmdb-key');
  $('#gemini-key').value = key('gemini-key');
  $('#settings-dialog').showModal();
});

$('#settings-form').addEventListener('submit', (event) => {
  if (event.submitter?.value !== 'save') return;

  event.preventDefault();
  localStorage.setItem('cine-stream-tmdb-key', $('#tmdb-key').value.trim());
  localStorage.setItem('cine-stream-gemini-key', $('#gemini-key').value.trim());
  $('#settings-dialog').close();
  loadMovies({ reset: true });
});

window.addEventListener('hashchange', route);
window.addEventListener('popstate', route);

updateCount();
route();

if (!location.hash) {
  history.replaceState({}, '', '#/home');
  route();
}
