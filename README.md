# SciLayer

**从科研意图，到图像，再到可编辑图层。**

SciLayer 是为 **Codex** 设计的科研绘图工作流：一个负责需求与提示词校准的 skill，加上本地画布和 MCP 编辑引擎。适合科研流程图、框图、机制图和结构图。

先把科学结构说明白，再用 Codex 内置 imagegen 生成便于分层的图。图片满意后，由你决定开始可编辑化；文字、边框、箭头和简单图标成为独立对象，复杂插画保留为图片图层。可在 Codex 右侧拖动、改字、调色和导出。

> 0.5.0 · Codex 优先 · 本地服务 · 非商业用途许可，需保留署名

## 工作流

```text
绘图需求 → 必要问题与提示词校准 → Codex imagegen → 图片与侧栏预览
已有图片 ────────────────────────────────────────────┘
                                                     ↓ 用户选择
                                                清晰度初检
                                                     ↓
                      保留原图 ← 用户决定 → imagegen 清晰重绘
                                                     ↓ 用户发起转换
               可编辑图层 ← 对照原图重建 ← 选定的参考图
                   ↓
        侧栏编辑 → PPTX / SVG / PNG / PSD / JSON
```

- **提示词校准**：默认白背景，模块化插画、独立线框、文字、箭头四类元素齐全，减少重叠与细碎纹理。只追问会影响科学含义或结构的缺失信息。
- **自由生图与迭代**：不设“一次生成、一次重绘”这样的次数限制；仅生成不会自动转换。导出图也可再交给 imagegen，是否重新转换由用户决定。
- **先检测，再选择高清化**：尺寸与边缘统计结合 Codex 视觉检查；即使默认推荐 imagegen，也不会自动高清化。
- **原生对象编辑**：文字、形状、自由曲线、箭头、图层组合；实线/虚线；线宽、常用色和画面代表色；渐变色标与方向；圆角开关与半径。
- **同步编辑**：MCP 与本地界面共用场景 JSON，版本检查与冲突合并避免覆盖同时发生的修改。
- **图标矢量化**：文档、地球、放大镜等有限语义模板的匹配预览；可将多个图标拼版，用户选择 imagegen 清晰化后再切回识别。
- **从空白开始**：不附带内置案例、论文图片或个人工作数据。

## 安装：推荐在 Codex 中使用

需要 **Node.js 22+、npm、Git、Codex CLI**。图像生成需要当前 Codex 会话可用的 imagegen 能力；SciLayer 本身不包含生图模型、不需要另购本工具额度，也不保证宿主图像生成服务免费。

```powershell
git clone https://github.com/Su0tar/SciLayer.git
cd SciLayer
npm ci
npm run build
npm run install:codex
```

安装程序将 `skills/scilayer` 复制到 `~/.agents/skills/scilayer`，并用 Codex CLI 注册 `figure-workbench` stdio MCP。保留此克隆目录，MCP 配置指向其中的 `mcp/server.mjs`；移动目录后重新运行安装。为兼容早期版本，MCP 标识仍是 `figure-workbench`，产品和 skill 名称是 SciLayer。

安装后刷新 MCP 或重启 Codex，再输入 `$scilayer`。当前会话的工具列表可能需要重载才能看到新增工具。可用 `codex mcp list` 检查注册，用 `npm run doctor` 检查本地依赖和构建。

旧版 Codex 若使用 `~/.codex/skills`，可指定技能安装位置：

```powershell
node scripts/install.mjs --skills-dir "$HOME/.codex/skills"
```

只安装 skill、不修改 MCP 配置：

```powershell
node scripts/install.mjs --skill-only
```

手动注册 MCP（在克隆目录执行）：

```powershell
codex mcp add figure-workbench -- node "$PWD/mcp/server.mjs"
```

复制 skill 目录不会自动安装 Node 依赖。更新仓库后运行 `npm ci`、`npm run build`、`npm run install:codex`。请阅读并使用你信任的仓库副本。

## 在 Codex 中使用

```text
$scilayer 帮我画一张科研流程图，用于中文汇报PPT，横向16:9。
节点是样本采集、质量控制、特征提取、结果验证，按顺序连接。
每个模块用一个简洁示意图标，文字必须逐字保留。
先生成参考图，在右侧打开，我确认后再做可编辑化。
```

已有图片：

```text
$scilayer 使用当前对话刚生成的最新图片，先检查清晰度，
需要高清化时给我选项，不要自动重绘。
```

满意后：

```text
这张图可以了，开始可编辑化，保留原图布局，导出PPTX和JSON。
```

继续编辑：

```text
将选中的箭头改为虚线，框的圆角半径设为16，填充改为蓝绿渐变。
```

skill 调用 `open_editor`；支持 MCP Apps 的宿主可渲染 UI 资源，Codex 也可将返回的本地地址打开为右侧浏览器标签。原生 MCP App 的承载方式取决于 Codex 版本；本地浏览器模式同样可用。

**最新图片**优先来自当前会话已知的 imagegen 输出路径。另一个对话的图片只有在附件或文件路径确实可访问时才能导入，不能自动读取所有历史对话。设置参考预览不等于转换，也不会清空已有画布。

## 本地打开

```powershell
npm start
```

浏览器打开 [本地画布](http://127.0.0.1:4317/?panel=1)。Windows 也可双击 `start-workbench.cmd`，它会在需要时启动本地服务并打开系统浏览器窗口。

无需 Codex，仍可使用图层编辑、导入 JSON、参考图裁剪和导出。普通网页不能自行使用 Codex 内置 imagegen，也不能自动向 Codex 发消息：“交给 Codex”会复制指令，需粘贴回对话。推荐在 Codex 中生成和重建；独立网页可选择配置自己的兼容视觉 API（见 `.env.example` 和界面设置），调用费用和数据传输由该服务决定。

服务只绑定 `127.0.0.1`。项目状态和历史记录保存在本地 `data/`；导出与图集输出保存在 `output/`。这些目录不进入 Git。将参考图交给 imagegen 或外部模型时，该图会发送给所用模型服务；本地编辑与导出本身不上传图片。不要将服务直接暴露到公网。

## MCP 与数据格式

| 任务 | 主要工具 |
| --- | --- |
| 打开侧栏、读取状态 | `open_editor`, `get_canvas`, `get_reference_image` |
| 提示与流程 | `get_generation_brief`, `get_workflow_plan`, `set_workflow` |
| 参考图和清晰度 | `import_reference_image`, `assess_image_quality` |
| 重建与修改 | `get_reconstruction_schema`, `replace_canvas`, `update_objects`, `add_objects`, `delete_objects` |
| 图标 | `vectorize_icons`, `prepare_icon_atlas`, `vectorize_icon_atlas` |
| 核验与交付 | `check_layout`, `get_canvas_preview`, `export_figure` |

场景格式详见 [SCENE_FORMAT.md](SCENE_FORMAT.md)。写入需要读取时的 revision；冲突时重新读取并合并。

## 当前边界

- **由 Codex 视觉理解结构，工具执行保存与导出**。当前并非离开模型就能对任意科研图进行完整自动语义分割的算法，也未内置通用 OCR 或本地超分模型。
- 清晰度检测是启发式初检，不保证小字正确、插画完整或科学内容可信。imagegen 清晰重绘可能改变细节，需对照原图。
- PPTX 的文字、基础形状、支持的路径、线条与渐变是原生对象；复杂插画为可移动、可替换的位图，内部细节不能逐个编辑。
- SVG 保留文字与矢量对象；PNG 是平面预览。PSD 保留图层和文字数据，但非文字图层使用栅格缓存，不是 Photoshop 原生矢量形状层。
- 图标匹配只有有限模板，必须检查预览；不等同于任意图片的高保真矢量描摹。
- Windows 是当前主要验证环境；导出字体受本机可用字体影响。无需安装 PowerPoint 也可导出 PPTX。

## 开发与验证

```powershell
npm run build
npm test
npm run doctor
```

测试覆盖真实 HTTP 鉴权、版本冲突与持久化、stdio MCP 握手与 UI 资源、并发状态、原生导出、渐变/圆角、路径、图标图集和清晰度检测。测试图形为独立构造的几何夹具，不依赖个人源图。开发模式运行 `npm run dev`。

## 许可与署名

原始代码和 skill 使用 [PolyForm Noncommercial License 1.0.0](LICENSE.md)：**允许符合许可定义的非商业用途、修改与分发；商业使用需另行获得作者许可。分发时须保留许可和 NOTICE 中的 Required Notice 署名。**

建议项目介绍注明：`SciLayer by Suyang Yuan — https://github.com/Su0tar/SciLayer`。完整条件以 LICENSE.md 为准。它属于源码可见的非商业许可，不是 OSI 意义的开源许可。第三方组件保留各自许可，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)；本软件许可不自动改变用户图片或导出作品的权利归属。

作者：**Suyang Yuan（袁溯阳）** · [GitHub / Su0tar](https://github.com/Su0tar)。

Codex skill 的发现与调用参见 [官方技能文档](https://learn.chatgpt.com/docs/build-skills)。SciLayer 为独立项目，与 FigureLab 无隶属关系。
