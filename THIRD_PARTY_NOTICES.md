# Third-party components

SciLayer's original code and skill use PolyForm Noncommercial 1.0.0. This does not relicense dependencies, user reference images, fonts, generated images or exported figures. Follow each applicable license and service terms.

Dependencies are installed through npm and not vendored in this source release. License and copyright texts are included in their npm packages. See `package-lock.json` for the resolved dependency graph.

| Component | Purpose | Upstream |
| --- | --- | --- |
| MCP SDK / MCP Apps | Tools and host UI | https://github.com/modelcontextprotocol |
| React | Editor interface | https://github.com/facebook/react |
| Vite | Bundling | https://github.com/vitejs/vite |
| Express | Local service | https://github.com/expressjs/express |
| Zod | Validation | https://github.com/colinhacks/zod |
| PptxGenJS | PowerPoint export | https://github.com/gitbrent/PptxGenJS |
| JSZip | OOXML processing | https://github.com/Stuk/jszip |
| ag-psd | PSD export | https://github.com/Agamnentzar/ag-psd |
| @napi-rs/canvas | Raster previews | https://github.com/Brooooooklyn/canvas |
| sharp | Images and quality screening | https://github.com/lovell/sharp |
| Lucide | Interface icons | https://github.com/lucide-icons/lucide |
| Playwright | Development dependency | https://github.com/microsoft/playwright |

The semantic templates in `src/icon-library.js` are authored geometry, not traced source figure bitmaps. System fonts are referenced, not included. No Real-ESRGAN weights or user source figures ship in this release.
