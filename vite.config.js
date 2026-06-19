import { defineConfig } from 'vite';

// Derive the GitHub Pages base path from the repo name so the build works
// regardless of what the repository is actually called.
function pagesBase() {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) {
    return '/';
  }
  const name = repo.split('/')[1];
  return name ? `/${name}/` : '/';
}

export default defineConfig({
  base: pagesBase(),
});
