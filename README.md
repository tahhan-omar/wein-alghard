# وين الغرض؟ — Cultural Day game

Files:
- index.html, style.css, game.js  → the game UI (don't edit from the stages side)
- data/stages.json               → stages + objects + rects (edited by editor.html)
- img/<stage>.webp               → scene images
- img/icons/<stage>/<id>.webp    → optional; if missing, the game crops the icon from the scene

Run (must be served, not opened as a file):
    python3 -m http.server 8000      → open http://localhost:8000
Or upload the folder to GitHub Pages / Netlify.

A stage appears in the game only when its image loads AND at least one object has a rect.
If no stage is ready, a demo version runs (red badge on the start screen).

Staff panel: long-press the top-left corner for 3 seconds (or press F2 on a laptop):
sound on/off, show hitboxes, per-stage status, play a specific stage.
