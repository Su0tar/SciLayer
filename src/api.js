let appPromise;
export const isMcpApp = () => !!window.FIGURE_MCP_APP;
async function bridge() {
  if (!appPromise)
    appPromise = (async () => {
      const { App } = await import("@modelcontextprotocol/ext-apps");
      const app = new App(
        { name: "SciLayer", version: "0.5.0" },
        {},
        { autoResize: false },
      );
      await app.connect();
      return app;
    })();
  return appPromise;
}
export async function mcpCall(name, args = {}) {
  const app = await bridge();
  const result = await app.callServerTool({ name, arguments: args });
  if (result.isError)
    throw Error(
      result.content?.find((c) => c.type === "text")?.text || "MCP操作失败",
    );
  return (
    result.structuredContent ||
    JSON.parse(result.content?.find((c) => c.type === "text")?.text || "{}")
  );
}
export async function sendToConversation(text) {
  const app = await bridge();
  return app.sendMessage({ role: "user", content: [{ type: "text", text }] });
}
export function createTransport() {
  let token = "";
  const rawRequest = async (url, options = {}, retry = true) => {
    const r = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.method && options.method !== "GET"
          ? { Authorization: `Bearer ${token}` }
          : {}),
      },
    });
    if (r.status === 401 && retry) {
      const status = await (await fetch("/api/status")).json();
      token = status.token;
      return rawRequest(url, options, false);
    }
    return r;
  };
  const request = async (url, options = {}) => {
    const r = await rawRequest(url, options);
    const d = await r.json();
    if (!r.ok) {
      const e = Error(d.error || `HTTP ${r.status}`);
      e.status = r.status;
      throw e;
    }
    return d;
  };
  return {
    async start() {
      if (isMcpApp()) return { token: "mcp", configured: false, mcp: true };
      const s = await request("/api/status");
      token = s.token;
      return s;
    },
    async get() {
      return isMcpApp() ? mcpCall("get_editor_state") : request("/api/state");
    },
    async put(scene, revision, actor) {
      if (isMcpApp())
        return mcpCall("replace_canvas", {
          scene,
          expected_revision: revision,
          actor,
        });
      return request("/api/scene", {
        method: "PUT",
        body: JSON.stringify({ scene, revision, actor }),
      });
    },
    async select(ids) {
      if (isMcpApp()) {
        const app = await bridge();
        await app.callServerTool({ name: "set_selection", arguments: { ids } });
        await app.updateModelContext({
          content: [
            {
              type: "text",
              text: "画布当前选中的对象ID：" + JSON.stringify(ids),
            },
          ],
        });
        return;
      }
      return request("/api/selection", {
        method: "PUT",
        body: JSON.stringify({ ids }),
      });
    },
    async reference(reference) {
      if (isMcpApp()) return mcpCall("set_reference", { reference });
      return request("/api/reference", {
        method: "PUT",
        body: JSON.stringify({ reference }),
      });
    },
    async workflow(value) {
      if (isMcpApp()) return mcpCall('set_workflow', value);
      return request('/api/workflow', { method: 'PUT', body: JSON.stringify(value) });
    },
    async vectorize(ids) {
      return isMcpApp()?mcpCall('vectorize_icons',{ids}):request('/api/vectorize-icons',{method:'POST',body:JSON.stringify({ids})});
    },
    async ai(body) {
      if (isMcpApp())
        throw Error("MCP面板请直接在旁边的Codex对话中描述重建或修改要求。");
      return request("/api/ai", { method: "POST", body: JSON.stringify(body) });
    },
    listen(onchange) {
      if (isMcpApp()) {
        const t = setInterval(onchange, 1800);
        return () => clearInterval(t);
      }
      const es = new EventSource("/api/events");
      es.onmessage = (e) => {
        try {
          onchange(JSON.parse(e.data));
        } catch {}
      };
      return () => es.close();
    },
    async export(scene, format, options = {}) {
      if (isMcpApp()) {
        const app = await bridge();
        const r = await app.callServerTool({
          name: "download_export",
          arguments: { scene, format, ...options },
        });
        if (r.isError) throw Error(r.content?.[0]?.text || "导出失败");
        const e = r._meta?.export;
        if (!e) throw Error("宿主没有返回导出文件");
        const raw = atob(e.dataBase64),
          bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
        return new Blob([bytes], { type: e.mime });
      }
      const r = await rawRequest("/api/export", {
        method: "POST",
        body: JSON.stringify({ scene, format, ...options }),
      });
      if (!r.ok) throw Error((await r.json()).error);
      return r.blob();
    },
  };
}
