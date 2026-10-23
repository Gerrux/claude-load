# Screenshots

`docs/screenshots/*.png` are rendered from `index.html` with demo data, in the mod's own
design (the same SVG icons, bars and sparklines as `hooks/register.tsx`), so no real
sessions or projects appear in the README.

Regenerate with a Chromium-based browser in headless mode (paths for Windows; on macOS use
`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`):

```
chrome --headless=new --hide-scrollbars --force-device-scale-factor=2 --window-size=640,737 --screenshot=docs/screenshots/pane.png "file:///<repo>/docs/mock/index.html?scene=pane"
chrome --headless=new --hide-scrollbars --force-device-scale-factor=2 --window-size=820,104 --screenshot=docs/screenshots/band.png "file:///<repo>/docs/mock/index.html?scene=band"
chrome --headless=new --hide-scrollbars --force-device-scale-factor=2 --window-size=1080,593 --screenshot=docs/screenshots/terminal.png "file:///<repo>/docs/mock/index.html?scene=terminal"
```
