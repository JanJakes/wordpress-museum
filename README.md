# WordPress Museum

A standalone Three.js prototype for browsing WordPress release history as a
museum.

The museum textures are custom procedural canvas textures generated at runtime;
the project does not depend on third-party image assets.

## Preview

https://janjakes.github.io/wordpress-museum/

## Run

```bash
npm run dev
```

Then open `http://127.0.0.1:4173/`.

The local server sends CORS headers so the "Open in Playground" links can load
the Blueprint JSON files from this repo.
