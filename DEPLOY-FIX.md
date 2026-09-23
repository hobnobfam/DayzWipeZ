# Render fix

The server now supports BOTH frontend layouts:

- `public/index.html`
- root `index.html`

This prevents Render from failing with:
`ENOENT: no such file or directory, stat '/opt/render/project/src/public/index.html'`

The repository also contains a root `index.html`, matching the layout currently deployed from GitHub.

The PostgreSQL warning is separate: set `DATABASE_URL` in Render if community registration/server/wipe data is required.
