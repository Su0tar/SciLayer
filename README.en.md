# SciLayer

[简体中文](README.md) | [English](README.en.md)

**Turn ChatGPT / Codex ImageGen figures and other images into individually editable layers.**

SciLayer combines a **Codex skill, a local MCP engine, and a layer editor**. Give Codex a figure you like, rebuild it as separate text, shapes, arrows, icons and illustration layers, then select, move and edit them in the right-side canvas. Export to PPTX, SVG, PNG, PSD or JSON.

Use an image generated in ChatGPT, Codex ImageGen or another tool, or supply an existing scientific figure or screenshot. **Generating the image again is optional.** Layer conversion means that Codex interprets the image and reconstructs independent objects, while complex illustrations become separate image crops. It does not recover hidden source layers or turn every detail into a vector.

> 0.5.0 · Codex first · Local service · Apache-2.0 · Commercial use allowed

## See it in use

**Turn a reference image into editable objects inside Codex.** Request conversion in the conversation, then select and edit individual text, frames and arrows in the right-side canvas before exporting.

![SciLayer in the Codex side panel, with reconstructed diagram objects selected for editing](docs/screenshots/codex-layer-editing.png)

**Work with complex scientific figures as separate layers.** Edit text and frames independently while keeping illustrations as individual image layers. The property panel offers text settings, common colors and colors sampled from the figure.

![A complex scientific figure with an independent text object, text properties and a representative color palette](docs/screenshots/scientific-figure-layers.png)

The second screenshot shows an earlier development UI with the former Figure Workbench name and demo shortcuts that have since been removed. The current product is SciLayer. These are documentation screenshots; they are not bundled canvas examples.

## From one image to editable layers

| Source element | Independent layer | What you can edit |
| --- | --- | --- |
| Text and labels | Native text objects | Wording, font, size, color and position |
| Frames and basic shapes | Native shapes or supported vector paths | Size, stroke, solid/dashed lines, gradients and corner radius |
| Arrows and connectors | Separate connectors or paths | Endpoints, routing, line style and color |
| Simple icons | Supported semantic templates and vector paths | Scale, color and line width; review the template match |
| Complex illustrations | Individually cropped raster layers | Move, scale and replace; internal details remain raster |

Designed for scientific flowcharts, block diagrams, mechanism schematics and structural diagrams. You can also start with an idea: calibrate the prompt, generate a modular reference with Codex's built-in imagegen, and decide when to convert it. **ChatGPT-generated images are supported inputs; the skill and MCP integration currently run in Codex.**

## Workflow and features

```text
ChatGPT / Codex ImageGen figure or another reference image
                         |
              Clarity check + visual review
                         |
         Optional enhancement, only when you choose it
                         |
              You request layer conversion
                         |
       Codex interprets the figure and rebuilds its layers
                         |
              Edit in the right-side canvas
                         |
               PPTX / SVG / PNG / PSD / JSON

Starting from an idea? Calibrate the prompt and generate a reference first.
```

- **Prompt calibration:** default to a white background, modular illustrations, separate frames, labels and arrows, with little overlap. Ask only about missing information that affects scientific meaning or structure.
- **Independent generation and conversion:** no fixed generation/redraw quota. Generating an image does not automatically start layer conversion. Exported previews can be sent back to imagegen for another iteration.
- **Check clarity before recommending enhancement:** use dimensions and edge statistics together with Codex visual review. Even when imagegen is the recommended option, enhancement requires your choice.
- **Object editing:** text, shapes, freeform paths, arrows and groups; line styles and widths; common and representative colors; gradient stops and direction; optional rounded corners and radius.
- **Shared state:** the UI and MCP use the same scene JSON, revision checks and conflict merging.
- **Icon workflow:** preview matches for a limited set of semantic templates. Optionally assemble unclear icons into an atlas, enhance it with imagegen when requested, then map the icons back.
- **Blank by default:** no bundled demo cases, paper figures or personal working data.

## Install: recommended for Codex

Requires **Node.js 22+, npm, Git and Codex CLI**. Image generation requires imagegen to be available in the current Codex session. SciLayer does not bundle an image model or require separate SciLayer credits; the host's image generation service may have its own limits and costs.

```powershell
git clone https://github.com/Su0tar/SciLayer.git
cd SciLayer
npm ci
npm run build
npm run install:codex
```

The installer copies `skills/scilayer` to `~/.agents/skills/scilayer` and registers the `figure-workbench` stdio MCP server through Codex CLI. Keep the clone in place: the MCP configuration points to `mcp/server.mjs` inside it. Run the installer again if you move the directory. The MCP identifier remains `figure-workbench` for compatibility; the product and skill are named SciLayer.

Reload MCP or restart Codex, then invoke `$scilayer`. The current session may need to reload its tool list. Check registration with `codex mcp list` and local dependencies/builds with `npm run doctor`.

For an older Codex installation that uses `~/.codex/skills`:

```powershell
node scripts/install.mjs --skills-dir "$HOME/.codex/skills"
```

Install only the skill, without changing MCP registration:

```powershell
node scripts/install.mjs --skill-only
```

Manual MCP registration from the clone directory:

```powershell
codex mcp add figure-workbench -- node "$PWD/mcp/server.mjs"
```

Copying the skill does not install Node dependencies. After updating the repository, run `npm ci`, `npm run build` and `npm run install:codex`. Inspect and use a repository copy you trust.

## Use in Codex

Convert an existing image:

```text
$scilayer Turn this ChatGPT / Codex ImageGen scientific figure into editable layers.
Rebuild text, frames and arrows separately; keep complex illustrations as individual image layers.
Preserve the layout, open it in the right-side canvas, and export PPTX and JSON.
If it is unclear, suggest options before redrawing it.
```

Generate a new reference:

```text
$scilayer Draw a scientific workflow for a presentation, landscape 16:9.
Connect Sample collection, Quality control, Feature extraction and Validation in that order.
Use one simple schematic icon per module and preserve the labels exactly.
Generate a reference and open it on the right. Wait for my choice before converting it to layers.
```

Use the latest generated image:

```text
$scilayer Use the latest image generated in this conversation. Check its clarity first.
Offer enhancement options if needed; do not automatically redraw it.
```

Continue editing:

```text
Make the selected arrow dashed. Set the frame corner radius to 16
and change its fill to a blue-green gradient.
```

The skill calls `open_editor`. Hosts with MCP Apps support can render the UI resource; Codex can also open the returned local URL in a right-side browser tab. Native MCP App hosting depends on the Codex version. The local browser mode remains available.

The **latest image** means an actual imagegen output path known in the current session. Images from another conversation must be accessible as attachments or supplied file paths; SciLayer cannot automatically read all chat history. Setting a reference preview does not start conversion or clear the existing canvas.

## Run locally

```powershell
npm start
```

Open the [local canvas](http://127.0.0.1:4317/?panel=1). On Windows, double-click `start-workbench.cmd` to start the service if needed and open a browser window.

Layer editing, JSON import, reference cropping and export also work without Codex. A standalone webpage cannot call Codex's built-in imagegen or send messages to Codex by itself: “send to Codex” copies an instruction for you to paste into the conversation. Codex is the recommended environment for generation and reconstruction. The standalone UI optionally supports a user-configured compatible vision API; see `.env.example` and the connection settings. That service determines costs and data transfer.

The server binds only to `127.0.0.1`. State/history stay in local `data/`; exports and atlases go to `output/`. Neither directory is tracked in Git. Sending a reference to imagegen or another model transmits it to that service; local editing and export do not upload it. Do not expose the server directly to the public internet.

## MCP and scene format

| Task | Main tools |
| --- | --- |
| Open the editor and read state | `open_editor`, `get_canvas`, `get_reference_image` |
| Prompt and workflow | `get_generation_brief`, `get_workflow_plan`, `set_workflow` |
| Reference images and clarity | `import_reference_image`, `assess_image_quality` |
| Reconstruction and editing | `get_reconstruction_schema`, `replace_canvas`, `update_objects`, `add_objects`, `delete_objects` |
| Icons | `vectorize_icons`, `prepare_icon_atlas`, `vectorize_icon_atlas` |
| Review and delivery | `check_layout`, `get_canvas_preview`, `export_figure` |

See [SCENE_FORMAT.md](SCENE_FORMAT.md) for the scene schema. Writes require the revision read from the canvas; re-read and merge when a conflict occurs.

## Current limits

- **Codex interprets the figure; the tools store and export its objects.** This is not a standalone universal semantic segmentation algorithm. No general OCR or local super-resolution model is bundled.
- Clarity detection is a heuristic, not a guarantee that tiny labels, illustration details or scientific claims are correct. Imagegen redraws can change details; compare against the original.
- PPTX text, basic shapes, supported paths, lines and gradients are native objects. Complex illustrations remain movable, replaceable raster images.
- SVG retains text and vector objects; PNG is a flat preview. PSD retains layers and text data, but non-text layers use raster caches rather than native Photoshop vector shape layers.
- Icon matching uses a finite template set and needs review; it is not arbitrary high-fidelity image tracing.
- Windows is the primary validated environment. Exported fonts depend on locally available fonts. PowerPoint does not need to be installed to export PPTX.

## Development and checks

```powershell
npm run build
npm test
npm run doctor
```

Tests cover HTTP authentication, revision conflicts and persistence, stdio MCP handshakes and UI resources, concurrent state, native exports, gradients/corners, paths, icon atlases and clarity detection. Fixtures are synthetic geometry and do not depend on personal source images. Use `npm run dev` for development.

## License and attribution

The original code and skill are licensed under the [Apache License 2.0](LICENSE.md). **Commercial and noncommercial use, modification and distribution are allowed**, subject to the license, which also includes an express patent grant. Distribution must comply with its conditions, including providing the license, retaining applicable copyright and attribution notices and [NOTICE](NOTICE), and prominently marking modified files. The full license controls.

Suggested project credit: `SciLayer by Suyang Yuan — https://github.com/Su0tar/SciLayer`. Third-party components retain their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The software license does not automatically change rights in user images or exported figures.

Author: **Suyang Yuan (袁溯阳)** · [GitHub / Su0tar](https://github.com/Su0tar).

See the [official skill documentation](https://learn.chatgpt.com/docs/build-skills) for Codex skill discovery and invocation. SciLayer is an independent project and is not affiliated with FigureLab.
