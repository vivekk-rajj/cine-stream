const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';
const OMDB_BASE = 'https://www.omdbapi.com';

const state = {
  page: 0,
  totalPages: 1,
  query: '',
  loading: false,
  favorites: JSON.parse(localStorage.getItem('cine-stream-favorites') || '[]'),
  debounceTimer: null,
};

const $ = (selector) => document.querySelector(selector);
const grid = $('#movie-grid');

function key(name) {
  return localStorage.getItem(`cine-stream-${name}`) || '';
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

async function tmdb(path, params = {}) {
  const apiKey = key('tmdb-key');

  if (apiKey) {
    const url = new URL(TMDB_BASE + path);
    Object.entries({ api_key: apiKey, language: 'en-US', ...params }).forEach(([keyName, value]) => {
      url.searchParams.set(keyName, value);
    });

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`TMDB request failed (${response.status}). Check your API key.`);
    }

    return response.json();
  }

  const omdbKey = key('omdb-key');
  if (omdbKey && params.query) {
    const url = new URL(OMDB_BASE);
    url.searchParams.set('apikey', omdbKey);
    url.searchParams.set('s', params.query);
    const response = await fetch(url);
    if (!response.ok) throw new Error('OMDB request failed.');
    const omdb = await response.json();
    if (omdb.Response === 'False') {
      throw new Error(omdb.Error || 'No results found.');
    }
    return {
      results: (omdb.Search || []).map((item) => ({
        id: Number.parseInt(item.imdbID.replace(/\D/g, ''), 10) || item.Title,
        title: item.Title,
        release_date: item.Year,
        vote_average: item.imdbRating || 0,
        poster_path: item.Poster && item.Poster !== 'N/A' ? item.Poster : '',
      })),
      page: 1,
      total_pages: 1,
      total_results: Number(omdb.totalResults) || (omdb.Search || []).length,
    };
  }

  $('#settings-dialog').showModal();
  throw new Error('Add your TMDB API key in settings to load movies.');
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
        <button class="favorite ${saved ? 'saved' : ''}" aria-label="${saved ? 'Remove' : 'Add'} ${movie.title} ${saved ? 'from' : 'to'} favorites">${saved ? '♥' : '♡'}</button>
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
    button.setAttribute('aria-label', `Remove ${movie.title} from favorites`);
  } else {
    state.favorites.splice(index, 1);
    button.classList.remove('saved');
    button.textContent = '♡';
    button.setAttribute('aria-label', `Add ${movie.title} to favorites`);
  }

  saveFavorites();

  if (normalizeRoute() === '/favorites') {
    route();
  }
}

async function loadMovies({ reset = false } = {}) {
  if (state.loading || (!reset && state.page >= state.totalPages)) return;

  if (reset) {
    state.page = 0;
    state.totalPages = 1;
    grid.innerHTML = '';
    $('#empty-state').hidden = true;
  }

  setLoading(true);
  setStatus('');

  try {
    const query = state.query.trim();
    const data = query
      ? await tmdb('/search/movie', { query, page: state.page + 1, include_adult: false })
      : await tmdb('/movie/popular', { page: state.page + 1 });

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
    if (error.message !== 'Add your TMDB API key in settings to load movies.') {
      setStatus(error.message);
    }
  } finally {
    setLoading(false);
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
  const geminiKey = key('gemini-key');
  if (!geminiKey) {
    setStatus('Add an optional Gemini API key in settings to use Mood Matcher.');
    $('#settings-dialog').showModal();
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
    setStatus(error.message);
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
  $('#omdb-key').value = key('omdb-key');
  $('#settings-dialog').showModal();
});

$('#settings-form').addEventListener('submit', (event) => {
  if (event.submitter?.value !== 'save') return;

  event.preventDefault();
  localStorage.setItem('cine-stream-tmdb-key', $('#tmdb-key').value.trim());
  localStorage.setItem('cine-stream-gemini-key', $('#gemini-key').value.trim());
  localStorage.setItem('cine-stream-omdb-key', $('#omdb-key').value.trim());
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
