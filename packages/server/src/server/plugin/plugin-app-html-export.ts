import type { PluginAppComponent, PluginAppDocument } from "@getpaseo/protocol/messages";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function fieldDescription(component: PluginAppComponent): string {
  if (!("description" in component) || !component.description) return "";
  return `<div class="hint">${escapeHtml(component.description)}</div>`;
}

function headingTag(level: number | undefined): "h1" | "h2" | "h3" {
  if (level === 1) return "h1";
  if (level === 3) return "h3";
  return "h2";
}

function buttonClass(
  variant: Extract<PluginAppComponent, { type: "button" }>["variant"],
): "primary" | "secondary" | "destructive" {
  if (variant === "destructive") return "destructive";
  if (variant === "secondary") return "secondary";
  return "primary";
}

// oxlint-disable-next-line complexity -- exhaustive rendering keeps every declarative component escaped in one auditable switch.
function renderComponent(component: PluginAppComponent): string {
  switch (component.type) {
    case "heading": {
      const level = headingTag(component.level);
      return `<${level}>${escapeHtml(component.text)}</${level}>`;
    }
    case "text":
      return `<p>${escapeHtml(component.text)}</p>`;
    case "text_input":
      return `<label><span>${escapeHtml(component.label)}</span><input type="text" placeholder="${escapeHtml(component.placeholder)}" value="${escapeHtml(component.defaultValue)}"${component.required ? " required" : ""}>${fieldDescription(component)}</label>`;
    case "textarea":
      return `<label><span>${escapeHtml(component.label)}</span><textarea placeholder="${escapeHtml(component.placeholder)}"${component.required ? " required" : ""}>${escapeHtml(component.defaultValue)}</textarea>${fieldDescription(component)}</label>`;
    case "number_input":
      return `<label><span>${escapeHtml(component.label)}</span><input type="number" placeholder="${escapeHtml(component.placeholder)}" value="${escapeHtml(component.defaultValue)}"${component.min === undefined ? "" : ` min="${component.min}"`}${component.max === undefined ? "" : ` max="${component.max}"`}${component.required ? " required" : ""}>${fieldDescription(component)}</label>`;
    case "select":
      return `<label><span>${escapeHtml(component.label)}</span><select${component.required ? " required" : ""}>${component.options
        .map(
          (option) =>
            `<option value="${escapeHtml(option.value)}"${option.value === component.defaultValue ? " selected" : ""}>${escapeHtml(option.label)}</option>`,
        )
        .join("")}</select>${fieldDescription(component)}</label>`;
    case "checkbox":
      return `<label class="checkbox"><span>${escapeHtml(component.label)}${fieldDescription(component)}</span><input type="checkbox"${component.defaultValue ? " checked" : ""}></label>`;
    case "button":
      return `<button type="button" class="${buttonClass(component.variant)}">${escapeHtml(component.label)}</button>`;
    case "status":
      return `<section class="output"><strong>${escapeHtml(component.label ?? "状态")}</strong><div class="muted">尚未运行</div></section>`;
    case "result":
      return `<section class="output"><strong>${escapeHtml(component.label ?? "结果")}</strong><div class="muted">运行后在 Paseo 中展示结果</div></section>`;
    case "json":
      return `<section class="output"><strong>${escapeHtml(component.label ?? "JSON")}</strong><pre>${escapeHtml(component.value === undefined ? "暂无数据" : JSON.stringify(component.value, null, 2))}</pre></section>`;
  }
}

export function renderPluginAppHtml(document: PluginAppDocument): string {
  const components = document.components.map(renderComponent).join("\n");
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'; frame-src 'none'; object-src 'none'">
  <title>${escapeHtml(document.title)}</title>
  <style>
    :root { color-scheme: light; font-family: Inter, "PingFang SC", "Microsoft YaHei", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f7f8fa; color: #1d2129; }
    main { width: min(760px, calc(100% - 32px)); margin: 32px auto; padding: 28px; background: #fff; border: 1px solid #e5e6eb; border-radius: 16px; box-shadow: 0 8px 28px rgba(29, 33, 41, .06); }
    header { margin-bottom: 28px; }
    h1, h2, h3, p { margin: 0; }
    h1 { font-size: 28px; line-height: 1.35; }
    h2 { margin-top: 8px; font-size: 22px; }
    h3 { margin-top: 6px; font-size: 18px; }
    p, .description { color: #4e5969; line-height: 1.7; }
    .description { margin-top: 8px; }
    form { display: grid; gap: 20px; }
    label { display: grid; gap: 8px; font-size: 14px; font-weight: 600; }
    input, textarea, select { width: 100%; border: 1px solid #c9cdd4; border-radius: 10px; background: #f7f8fa; color: #1d2129; padding: 12px 14px; font: inherit; }
    textarea { min-height: 112px; resize: vertical; }
    .hint, .muted { color: #86909c; font-size: 13px; font-weight: 400; line-height: 1.6; }
    .checkbox { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    .checkbox input { width: 20px; height: 20px; }
    button { min-height: 44px; border: 0; border-radius: 10px; padding: 0 18px; font: inherit; font-weight: 600; }
    button.primary { background: #165dff; color: #fff; }
    button.secondary { background: #f2f3f5; color: #1d2129; }
    button.destructive { background: #f53f3f; color: #fff; }
    .output { display: grid; gap: 10px; padding: 16px; border-radius: 12px; background: #f7f8fa; }
    pre { margin: 0; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font: 12px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace; }
    .preview-note { margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e6eb; color: #86909c; font-size: 12px; }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>${escapeHtml(document.title)}</h1>
      ${document.description ? `<div class="description">${escapeHtml(document.description)}</div>` : ""}
    </header>
    <form>${components}</form>
    <div class="preview-note">这是 Paseo 自动保存的安全 HTML 预览。服务提交和实时结果请在 Paseo 中运行。</div>
  </main>
</body>
</html>
`;
}
