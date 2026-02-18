const THEME_STORAGE_KEY = 'site-theme';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

function preferredTheme() {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') {
    return stored;
  }
  return 'dark';
}

function updateThemeButton() {
  const button = document.getElementById('themeToggleBtn');
  if (!button) {
    return;
  }
  const theme = document.documentElement.getAttribute('data-theme') || 'dark';
  button.textContent = theme === 'dark' ? 'Switch to Bright Mode' : 'Switch to Dark Mode';
}

(function initTheme() {
  applyTheme(preferredTheme());
  updateThemeButton();

  const button = document.getElementById('themeToggleBtn');
  if (!button) {
    return;
  }

  button.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem(THEME_STORAGE_KEY, next);
    updateThemeButton();
    document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: next } }));
  });
})();
