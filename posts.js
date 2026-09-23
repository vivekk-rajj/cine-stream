const DEFAULT_API_URL = 'http://localhost:5000';

export function getApiBaseUrl() {
  const envUrl = import.meta?.env?.VITE_API_URL;
  const baseUrl = (typeof envUrl === 'string' && envUrl.trim()) || DEFAULT_API_URL;
  return baseUrl.replace(/\/+$/, '');
}

function normalizePost(post) {
  if (!post) return null;

  const id = post._id || post.id;
  if (!id) return null;

  return {
    id: String(id),
    title: post.title || 'Untitled',
    content: post.content || '',
    imageUrl: post.imageUrl || post.image || post.thumbnail || '',
  };
}

async function request(path, options = {}) {
  const response = await fetch(`${getApiBaseUrl()}${path}`, options);
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    const message = typeof payload === 'object' ? payload?.message : payload;
    throw new Error(message || `Request failed (${response.status})`);
  }

  return payload;
}

export function setupPostsIntegration() {
  const list = document.querySelector('#posts-list');
  const loading = document.querySelector('#posts-loading');
  const empty = document.querySelector('#posts-empty');
  const status = document.querySelector('#posts-status');
  const form = document.querySelector('#post-form');
  const titleInput = document.querySelector('#post-title');
  const contentInput = document.querySelector('#post-content');
  const imageInput = document.querySelector('#post-image');

  if (!list || !loading || !empty || !status || !form || !titleInput || !contentInput || !imageInput) {
    return;
  }

  const state = { posts: [] };

  function setLoading(isLoading) {
    loading.hidden = !isLoading;
  }

  function setStatus(message = '') {
    status.textContent = message;
  }

  function renderPosts() {
    list.innerHTML = '';
    empty.hidden = state.posts.length > 0;

    state.posts.forEach((post) => {
      const item = document.createElement('article');
      item.className = 'post-card';
      item.dataset.postId = post.id;

      const heading = document.createElement('h3');
      heading.textContent = post.title;

      const body = document.createElement('p');
      body.textContent = post.content;

      const actions = document.createElement('div');
      actions.className = 'post-actions';

      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.action = 'delete-post';
      button.dataset.postId = post.id;
      button.textContent = 'Delete';
      button.setAttribute('aria-label', `Delete post: ${post.title}`);
      actions.appendChild(button);

      item.appendChild(heading);
      item.appendChild(body);

      if (post.imageUrl) {
        const image = document.createElement('img');
        image.src = post.imageUrl;
        image.alt = `${post.title} thumbnail`;
        image.loading = 'lazy';
        item.appendChild(image);
      }

      item.appendChild(actions);
      list.appendChild(item);
    });
  }

  async function fetchPosts() {
    setLoading(true);
    setStatus('');

    try {
      const payload = await request('/api/posts');
      const posts = Array.isArray(payload) ? payload : payload?.posts || [];
      state.posts = posts.map(normalizePost).filter(Boolean);
      renderPosts();
    } catch (error) {
      setStatus(error.message || 'Unable to load posts right now.');
      state.posts = [];
      renderPosts();
    } finally {
      setLoading(false);
    }
  }

  async function createPost(event) {
    event.preventDefault();
    setStatus('');

    const title = titleInput.value.trim();
    const content = contentInput.value.trim();

    if (!title || !content) {
      setStatus('Title and content are required.');
      return;
    }

    const formData = new FormData();
    formData.append('title', title);
    formData.append('content', content);

    if (imageInput.files?.[0]) {
      formData.append('image', imageInput.files[0]);
    }

    try {
      const payload = await request('/api/posts', {
        method: 'POST',
        body: formData,
      });
      const nextPost = normalizePost(payload?.post || payload);
      if (nextPost) {
        state.posts = [nextPost, ...state.posts];
        renderPosts();
      } else {
        await fetchPosts();
      }
      form.reset();
      setStatus('Post created.');
    } catch (error) {
      setStatus(error.message || 'Unable to create post right now.');
    }
  }

  async function deletePost(postId) {
    setStatus('');

    try {
      await request(`/api/posts/${encodeURIComponent(postId)}`, { method: 'DELETE' });
      state.posts = state.posts.filter((post) => post.id !== postId);
      renderPosts();
    } catch (error) {
      setStatus(error.message || 'Unable to delete post right now.');
    }
  }

  form.addEventListener('submit', createPost);

  list.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action="delete-post"]');
    if (!button) return;
    void deletePost(button.dataset.postId);
  });

  void fetchPosts();
}
