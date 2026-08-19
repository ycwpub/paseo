export function getIslandDocument(): string {
  return String.raw`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root {
        color-scheme: dark;
        font-family:
          -apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", "Segoe UI",
          sans-serif;
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        width: 100%;
        height: 100%;
        margin: 0;
        overflow: hidden;
        background: transparent;
        user-select: none;
        -webkit-user-select: none;
      }

      body {
        padding: 0 8px 8px;
      }

      button {
        font: inherit;
      }

      .island {
        width: 100%;
        height: 100%;
        overflow: hidden;
        color: #fff;
        background:
          radial-gradient(circle at 20% -40%, rgba(82, 119, 255, 0.24), transparent 54%),
          rgba(8, 8, 10, 0.97);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 28px;
        box-shadow:
          0 14px 38px rgba(0, 0, 0, 0.34),
          inset 0 1px 0 rgba(255, 255, 255, 0.06);
        transition:
          border-radius 160ms ease,
          background 160ms ease;
      }

      .island.expanded {
        border-radius: 24px;
      }

      .summary {
        width: 100%;
        height: 56px;
        padding: 8px 10px;
        display: grid;
        grid-template-columns: 40px minmax(0, 1fr) auto;
        align-items: center;
        gap: 10px;
        border: 0;
        color: inherit;
        background: transparent;
        text-align: left;
        cursor: pointer;
      }

      .status-icon {
        position: relative;
        width: 36px;
        height: 36px;
        display: grid;
        place-items: center;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.09);
      }

      .status-icon::after {
        content: "";
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: var(--status-color, #7f8cff);
        box-shadow: 0 0 14px var(--status-color, #7f8cff);
      }

      .status-icon.running::before {
        content: "";
        position: absolute;
        inset: 3px;
        border: 2px solid transparent;
        border-top-color: #8ea1ff;
        border-right-color: rgba(142, 161, 255, 0.35);
        border-radius: 50%;
        animation: spin 1.1s linear infinite;
      }

      .status-icon.finished {
        --status-color: #42d392;
      }

      .status-icon.error {
        --status-color: #ff5d69;
      }

      .status-icon.permission {
        --status-color: #ffb648;
      }

      .status-icon.info {
        --status-color: #6f8cff;
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      .copy {
        min-width: 0;
      }

      .title {
        overflow: hidden;
        font-size: 13px;
        font-weight: 650;
        line-height: 18px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .body {
        overflow: hidden;
        margin-top: 1px;
        color: rgba(255, 255, 255, 0.58);
        font-size: 11px;
        line-height: 15px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .count {
        min-width: 24px;
        height: 22px;
        padding: 0 7px;
        display: grid;
        place-items: center;
        border-radius: 999px;
        color: rgba(255, 255, 255, 0.72);
        background: rgba(255, 255, 255, 0.09);
        font-size: 10px;
        font-weight: 650;
      }

      .details {
        display: none;
        padding: 0 8px 8px;
      }

      .expanded .details {
        display: block;
      }

      .divider {
        height: 1px;
        margin: 0 6px 7px;
        background: rgba(255, 255, 255, 0.08);
      }

      .list {
        display: grid;
        gap: 4px;
      }

      .item {
        width: 100%;
        min-height: 43px;
        padding: 6px 8px;
        display: grid;
        grid-template-columns: 8px minmax(0, 1fr) auto;
        align-items: center;
        gap: 9px;
        border: 0;
        border-radius: 12px;
        color: inherit;
        background: transparent;
        text-align: left;
        cursor: pointer;
      }

      .item:hover {
        background: rgba(255, 255, 255, 0.07);
      }

      .dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--status-color, #6f8cff);
        box-shadow: 0 0 8px color-mix(in srgb, var(--status-color, #6f8cff) 72%, transparent);
      }

      .dot.finished {
        --status-color: #42d392;
      }

      .dot.error {
        --status-color: #ff5d69;
      }

      .dot.permission {
        --status-color: #ffb648;
      }

      .dot.running {
        --status-color: #8ea1ff;
      }

      .item-title {
        overflow: hidden;
        font-size: 11px;
        font-weight: 600;
        line-height: 15px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .item-body {
        overflow: hidden;
        color: rgba(255, 255, 255, 0.48);
        font-size: 10px;
        line-height: 14px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .dismiss {
        width: 24px;
        height: 24px;
        display: grid;
        place-items: center;
        border: 0;
        border-radius: 50%;
        color: rgba(255, 255, 255, 0.48);
        background: transparent;
        cursor: pointer;
      }

      .dismiss:hover {
        color: #fff;
        background: rgba(255, 255, 255, 0.1);
      }

      @media (prefers-reduced-motion: reduce) {
        *,
        *::before,
        *::after {
          animation-duration: 1ms !important;
          transition-duration: 1ms !important;
        }
      }
    </style>
  </head>
  <body>
    <main id="island" class="island" aria-live="polite">
      <button id="summary" class="summary" type="button">
        <span id="icon" class="status-icon info"></span>
        <span class="copy">
          <span id="title" class="title"></span>
          <span id="body" class="body"></span>
        </span>
        <span id="count" class="count" hidden></span>
      </button>
      <section class="details">
        <div class="divider"></div>
        <div id="list" class="list"></div>
      </section>
    </main>
    <script>
      (() => {
        const bridge = window.paseoIsland;
        const island = document.getElementById("island");
        const summary = document.getElementById("summary");
        const icon = document.getElementById("icon");
        const title = document.getElementById("title");
        const body = document.getElementById("body");
        const count = document.getElementById("count");
        const list = document.getElementById("list");
        let state = { expanded: false, items: [] };

        const render = (nextState) => {
          state = nextState && typeof nextState === "object" ? nextState : state;
          const items = Array.isArray(state.items) ? state.items : [];
          const current = items[0];
          if (!current) return;

          island.classList.toggle("expanded", state.expanded === true);
          icon.className = "status-icon " + current.kind;
          title.textContent = current.title || "";
          body.textContent = current.body || "";
          body.hidden = !current.body;
          count.hidden = items.length <= 1;
          count.textContent = "+" + Math.max(0, items.length - 1);

          list.replaceChildren(
            ...items.slice(0, 4).map((item) => {
              const row = document.createElement("div");
              row.className = "item";
              row.setAttribute("role", "button");
              row.tabIndex = 0;
              row.addEventListener("click", () => bridge.action("open", item.id));
              row.addEventListener("keydown", (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  bridge.action("open", item.id);
                }
              });

              const dot = document.createElement("span");
              dot.className = "dot " + item.kind;

              const copy = document.createElement("span");
              copy.className = "copy";
              const itemTitle = document.createElement("span");
              itemTitle.className = "item-title";
              itemTitle.textContent = item.title || "";
              const itemBody = document.createElement("span");
              itemBody.className = "item-body";
              itemBody.textContent = item.body || "";
              copy.append(itemTitle, itemBody);

              const dismiss = document.createElement("button");
              dismiss.type = "button";
              dismiss.className = "dismiss";
              dismiss.setAttribute("aria-label", "关闭提醒");
              dismiss.textContent = "×";
              dismiss.addEventListener("click", (event) => {
                event.stopPropagation();
                bridge.action("dismiss", item.id);
              });

              row.append(dot, copy, dismiss);
              return row;
            }),
          );
        };

        summary.addEventListener("click", () => {
          const current = state.items && state.items[0];
          if (current) bridge.action("open", current.id);
        });
        document.body.addEventListener("mouseenter", () => bridge.setExpanded(true));
        document.body.addEventListener("mouseleave", () => bridge.setExpanded(false));
        bridge.onState(render);
        bridge.ready();
      })();
    </script>
  </body>
</html>`;
}
