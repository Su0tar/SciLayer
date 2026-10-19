# 统一科研图格式 v2

## 目标与约束

画布编辑、MCP 修改、文件保存和导出使用相同 scene。文件扩展名 `.figure`，内容为 UTF-8 JSON。v1 基础场景读入后由 validateScene 升级到 v2。场景像素坐标与原始参考图的坐标一致，PPTX 按画布比例映射。

```json
{
  "version": 2,
  "name": "科研图",
  "width": 1501,
  "height": 1048,
  "background": "#ffffff",
  "nodes": []
}
```

nodes 从底层到顶层排序。id 必须唯一且保持稳定。修改原对象时保留 id，复制才生成新 id。宽高 100–8000，最多 1500 个对象。validateScene 是实际可执行的格式入口，get_reconstruction_schema 给出模型重建说明。

## 通用对象

| 字段 | 含义 |
| --- | --- |
| id / name | 稳定标识 / 用户可读名称 |
| type | text、rect、ellipse、diamond、arrow、image、path |
| x / y / w / h | 场景坐标及对象尺寸 |
| fill / stroke / strokeWidth | 六位十六进制颜色，或 none/transparent；边线宽度 |
| opacity / visible / locked | 透明度 0–1 / 可见 / 锁定 |
| layerGroup | 图层面板中的语义分区；不改变绘制顺序 |
| groupId | 实际一起选择、移动的组合；与 layerGroup 独立 |

rect 的 radius 表示圆角。locked 对象不接受移动、删除或普通局部更新；先单独提交 locked:false 解锁。

## 文字

text 是实际 Unicode 内容；fontFamily、fontSize、bold、italic、color、align(left/center/right)、lineHeight、wrap 定义样式。baseline 是首行基线相对字号的倍率，原图重建为 0.9。

wrap:false 用于精确复刻原图已经排好的行，换行符仍有效；编辑器内改长文字时会扩大文字框。wrap:true 根据宽度排版。几何检查不能代替中文校对或科研逻辑审阅。

## 连线与箭头

dash 支持 solid / dash / dot / dashDot；headStart / headEnd 各自控制箭头；headSize 可覆盖默认大小。

手工路径采用相对于 x/y/w/h 的归一化点列，不用多段散线冒充一个逻辑箭头：

```json
{
  "id":"edge-1", "type":"arrow", "name":"反馈路径",
  "x":100, "y":200, "w":400, "h":100,
  "points":[[0,0],[0.5,0],[0.5,1],[1,1]],
  "route":"manual", "fill":"none", "stroke":"#427761",
  "strokeWidth":3, "dash":"dash", "headStart":false, "headEnd":true
}
```

整体移动只改 x/y；缩放通过 w/h 保留形状比例；拖动顶点先转换为场景坐标，修改后重新归一化。pathNode 为标准转换函数。水平或竖直路径的宽高至少为 1，避免除零。

另一种连线使用 from/to 对象 ID 和 route(straight/elbow/bottom)，端点随目标对象移动。显式拖动一条与未选中对象相连的线时，转换为手工路径，保留当前形状。

## 贝塞尔形状（0.3 新增）

`type: "path"` 使用 `commands:[{cmd:"M",values:[u,v]},{cmd:"C",values:[u1,v1,u2,v2,u,v]},{cmd:"L",values:[u,v]},{cmd:"Z",values:[]}]`，也支持 Q（二次曲线，4 个值）。坐标相对 x/y/w/h；控制点允许位于包围框外，但实际曲线应在预期画布内。用于扇区、弧形边框等语义形状。最多 400 条命令，不接受原始任意 SVG 字符串。

画布可移动、缩放、改填充、边线与线型；MCP 可修改控制点。PPTX 导出为 `a:custGeom`，包含原生 cubicBezTo/quadBezTo。当前界面尚未提供钢笔工具或贝塞尔切线手柄。

## 图片素材

src 必须是内嵌 PNG/JPEG/WebP data URI。crop:{x,y,w,h} 是 0–1 原图归一化裁剪区域，导出时保留对应原始像素。图标、插画和照片使用图片，不逐像素/色块描摹。

MCP get_canvas 默认将大图片 src 替换为 EXISTING:对象id，减少模型上下文；replace_canvas 自动还原。REFERENCE 指向当前参考图。独立项目文件必须保存真实 data URI。

## 版本与修改接口

scene.version 是格式版本；revision 是服务中的编辑版本，两者含义不同。

- GET /api/state → {scene,revision,reference,selected,activity}。
- PUT /api/scene ← {scene,revision,actor}。
- POST /api/operations ← {revision,actor,operations}。
- 局部更新：{type:"update",id:"L003",changes:{dash:"dash"}}。
- 添加：{type:"add",node:{...}}；删除：{type:"delete",id:"..."}。
- 场景属性：{type:"canvas",changes:{background:"#ffffff"}}。
- 所有场景修改必须附上读取时的 revision，不匹配返回 409；整批操作先克隆校验，成功后一次保存。
- PUT /api/selection ← {ids:[...]}；选区变化也通过 SSE 同步。
- POST /api/export ← {scene?,format,nativeText?,width?}；从请求快照生成，避免导出期间覆盖编辑。

浏览器界面修改需 bearer token，由同源 /api/status 获取；本地 MCP 从 data/bridge-token 读取。所有接口限本机，前端通过 EventSource 接收 /api/events。服务器用串行写队列和原子重命名持久化 scene 与 revision。

## 模块位置

- model.js：校验、默认值、连接端点。
- operations.js：移动、路径、原子更新、复制、对齐、三方合并。
- store.js：保存、撤销、手势、选区与并发合并。
- render.js / canvas-render.js：SVG 与 Canvas 渲染。
- export.js / server-export.mjs：PPTX、SVG、PSD、PNG、JSON 导出。
- api.js：浏览器 HTTP 与 MCP App 宿主桥接的统一 transport。
- mcp/server.mjs：stdio 工具和 MCP Apps UI 资源。

## 0.4 线性渐变和实际圆角

`fill` / `stroke` 继续保留纯色作为关闭渐变后的后备颜色；可选 `fillGradient` / `strokeGradient`：

```json
{"type":"linear","angle":45,"stops":[{"offset":0,"color":"#b7d8ce"},{"offset":0.5,"color":"#bacfdd"},{"offset":1,"color":"#c1b8d5"}]}
```

支持2–8个严格递增色标，从0到1。角度0向右、90向下；`null` 或移除字段关闭渐变。`rect.radius` 为像素半径，0为直角，显示与导出限制到短边一半。PPTX 以 `roundRect` 的 `adj` 值保存实际半径。`path` 支持 `headStart` / `headEnd` 与 `headSize`，端点方向由曲线端点切线计算。

图标重建保存为普通 path，`iconKind` 标识识别的语义类别，双色图标以 groupId 组合。它们不依赖外部SVG或PNG。识别得分是模板距离，不是统计概率；对预览的人工核对仍然必要。
