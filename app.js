const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';
const state = { page: 0, totalPages: 1, query: '', loading: false, favorites: JSON.parse(localStorage.getItem('cine-stream-favorites') || '[]') };
const $ = (selector) => document.querySelector(selector);
const grid = $('#movie-grid');

function key(name) { return localStorage.getItem(`cine-stream-${name}`) || ''; }
function setStatus(message = '') { $('#status-message').textContent = message; }
function setLoading(value) { state.loading = value; $('#loading').hidden = !value; }
function updateCount() { $('#favorite-count').textContent = state.favorites.length; }
function saveFavorites() { localStorage.setItem('cine-stream-favorites', JSON.stringify(state.favorites)); updateCount(); }
function year(date) { return date ? date.slice(0, 4) : '—'; }
function poster(movie) { return movie.poster_path ? `${IMAGE_BASE}${movie.poster_path}` : 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="500" height="750"><rect width="100%" height="100%" fill="#20242d"/><text x="50%" y="50%" fill="#8b909d" text-anchor="middle" font-family="sans-serif" font-size="22">NO POSTER</text></svg>`); }

async function tmdb(path, params = {}) {
  const apiKey = key('tmdb-key');
  if (!apiKey) { $('#settings-dialog').showModal(); throw new Error('Add your TMDB API key in settings to load movies.'); }
  const url = new URL(TMDB_BASE + path);
  Object.entries({ api_key: apiKey, language: 'en-US', ...params }).forEach(([k, v]) => url.searchParams.set(k, v));
  const response = await fetch(url);
  if (!response.ok) throw new Error(`TMDB request failed (${response.status}). Check your API key.`);
  return response.json();
}

function renderMovies(movies, append = false) {
  if (!append) grid.innerHTML = '';
  $('#empty-state').hidden = movies.length > 0 || append;
  movies.forEach((movie, index) => {
    if (!movie.id) return;
    const saved = state.favorites.some((item) => item.id === movie.id);
    const card = document.createElement('article'); card.className = 'movie-card'; card.style.animationDelay = `${Math.min(index * 25, 250)}ms`;
    card.innerHTML = `<div class="poster"><button class="favorite ${saved ? 'saved' : ''}" aria-label="${saved ? 'Remove' : 'Add'} ${movie.title} ${saved ? 'from' : 'to'} favorites">${saved ? '♥' : '♡'}</button><img loading="lazy" src="${poster(movie)}" alt="${movie.title} poster" /></div><h3 class="movie-title" title="${movie.title}">${movie.title || 'Untitled'}</h3><div class="movie-meta"><span>${year(movie.release_date)}</span><span class="rating">★ ${movie.vote_average ? movie.vote_average.toFixed(1) : '—'}</span></div>`;
    card.querySelector('.favorite').addEventListener('click', () => toggleFavorite(movie, card.querySelector('.favorite')));
    grid.appendChild(card);
  });
}
function toggleFavorite(movie, button) {
  const index = state.favorites.findIndex((item) => item.id === movie.id);
  if (index === -1) state.favorites.push(movie); else state.favorites.splice(index, 1);
  saveFavorites(); button.classList.toggle('saved', index === -1); button.textContent = index === -1 ? '♥' : '♡';
  button.setAttribute('aria-label', `${index === -1 ? 'Remove' : 'Add'} ${movie.title} ${index === -1 ? 'from' : 'to'} favorites`);
}

async function loadMovies({ reset = false } = {}) {
  if (state.loading || (!reset && state.page >= state.totalPages)) return;
  if (reset) { state.page = 0; state.totalPages = 1; grid.innerHTML = ''; }
  setLoading(true); setStatus('');
  try {
    const data = state.query ? await tmdb('/search/movie', { query: state.query, page: state.page + 1, include_adult: false }) : await tmdb('/movie/popular', { page: state.page + 1 });
    state.page = data.page; state.totalPages = Math.min(data.total_pages, 500);
    renderMovies(data.results || [], state.page > 1);
    $('#catalog-title').textContent = state.query ? `Results for “${state.query}”` : location.hash === '#/favorites' ? 'My favorites' : 'Popular this week';
    $('#results-label').textContent = state.query ? `${data.total_results.toLocaleString()} movies` : '';
  } catch (error) { if (error.message !== 'Add your TMDB API key in settings to load movies.') setStatus(error.message); }
  finally { setLoading(false); }
}

let debounceTimer;
$('#search-input').addEventListener('input', (event) => { clearTimeout(debounceTimer); const value = event.target.value.trim(); if (!value) return; debounceTimer = setTimeout(() => { state.query = value; location.hash = '#/search'; loadMovies({ reset: true }); }, 500); });
$('#search-form').addEventListener('submit', (event) => { event.preventDefault(); clearTimeout(debounceTimer); state.query = $('#search-input').value.trim(); loadMovies({ reset: true }); });
$('#reset-button').addEventListener('click', () => { state.query = ''; $('#search-input').value = ''; location.hash = '#/home'; loadMovies({ reset: true }); });

async function moodMatch(prompt) {
  const geminiKey = key('gemini-key');
  if (!geminiKey) { setStatus('Add an optional Gemini API key in settings to use Mood Matcher.'); $('#settings-dialog').showModal(); return; }
  setStatus('Finding your mood match…');
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: `Return only one real movie title, with no punctuation or explanation, matching this mood: ${prompt}` }] }] }) });
    if (!response.ok) throw new Error('Mood Matcher could not reach Gemini.');
    const data = await response.json(); const title = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!title) throw new Error('No mood match found.');
    state.query = title; $('#search-input').value = title; await loadMovies({ reset: true });
  } catch (error) { setStatus(error.message); }
}
$('#mood-form').addEventListener('submit', (event) => { event.preventDefault(); const prompt = $('#mood-input').value.trim(); if (prompt) moodMatch(prompt); });

const observer = new IntersectionObserver((entries) => { if (entries[0].isIntersecting && location.hash !== '#/favorites') loadMovies(); }, { rootMargin: '500px' }); observer.observe($('#sentinel'));
$('#settings-button').addEventListener('click', () => { $('#tmdb-key').value = key('tmdb-key'); $('#gemini-key').value = key('gemini-key'); $('#settings-dialog').showModal(); });
$('#settings-form').addEventListener('submit', (event) => { if (event.submitter?.value === 'save') { event.preventDefault(); localStorage.setItem('cine-stream-tmdb-key', $('#tmdb-key').value.trim()); localStorage.setItem('cine-stream-gemini-key', $('#gemini-key').value.trim()); $('#settings-dialog').close(); loadMovies({ reset: true }); } });
function route() { const favorites = location.hash === '#/favorites'; document.querySelectorAll('[data-route]').forEach((link) => link.classList.toggle('active', link.dataset.route === (favorites ? 'favorites' : 'home'))); if (favorites) { state.query = ''; grid.innerHTML = ''; renderMovies(state.favorites); $('#catalog-title').textContent = 'My favorites'; $('#results-label').textContent = `${state.favorites.length} saved`; $('#empty-state').hidden = state.favorites.length > 0; } else if (!state.page || state.query) loadMovies({ reset: true }); }
window.addEventListener('hashchange', route); updateCount(); route();
