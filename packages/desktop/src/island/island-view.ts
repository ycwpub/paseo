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

      button {
        font: inherit;
      }

      [hidden] {
        display: none !important;
      }

      .island {
        --accent: #7d92ff;
        width: 100%;
        height: 100%;
        overflow: hidden;
        color: #fff;
        background: #000;
        border-radius: 0 0 18px 18px;
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.22);
      }

      .island.expanded {
        border-radius: 0 0 20px 20px;
        box-shadow: 0 14px 36px rgba(0, 0, 0, 0.4);
      }

      .summary {
        width: 100%;
        height: 100%;
        padding: 0 16px;
        display: grid;
        grid-template-columns: 44px minmax(120px, 1fr) 44px;
        align-items: center;
        border: 0;
        color: inherit;
        background: transparent;
        cursor: default;
      }

      .expanded .summary {
        display: none;
      }

      .brand-icon {
        width: 16px;
        height: 16px;
        display: grid;
        place-items: center;
        color: var(--accent);
        opacity: 0.94;
        filter: drop-shadow(0 0 3px color-mix(in srgb, var(--accent) 32%, transparent));
      }

      .brand-icon svg {
        width: 100%;
        height: 100%;
        display: block;
      }

      .summary .brand-icon {
        justify-self: start;
      }

      .notch-space {
        min-width: 0;
        height: 100%;
      }

      .unread-count {
        min-width: 28px;
        padding: 0 3px;
        justify-self: end;
        color: rgba(255, 255, 255, 0.96);
        font-size: 17px;
        font-weight: 520;
        line-height: 1;
        text-align: right;
        font-variant-numeric: tabular-nums;
      }

      .details {
        width: 100%;
        height: 100%;
        min-height: 0;
        display: none;
        flex-direction: column;
        padding: 10px 14px 14px;
      }

      .expanded .details {
        display: flex;
        animation: details-in 150ms ease-out both;
      }

      @keyframes details-in {
        from {
          opacity: 0;
          transform: translateY(-5px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .details-header {
        min-height: 52px;
        padding: 0 6px 10px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      }

      .details-brand {
        min-width: 0;
        flex: 1 1 auto;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .details-brand .brand-icon {
        width: 16px;
        height: 16px;
        flex: 0 0 auto;
      }

      .details-heading {
        min-width: 0;
        flex: 1 1 auto;
      }

      .details-title {
        overflow: hidden;
        font-size: 15px;
        font-weight: 650;
        line-height: 20px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .details-subtitle {
        margin-top: 2px;
        color: rgba(255, 255, 255, 0.48);
        font-size: 11px;
        line-height: 15px;
      }

      .clear {
        height: 30px;
        padding: 0 12px;
        flex: 0 0 auto;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 999px;
        color: rgba(255, 255, 255, 0.7);
        background: rgba(255, 255, 255, 0.06);
        font-size: 12px;
        cursor: pointer;
      }

      .clear:hover {
        color: #fff;
        background: rgba(255, 255, 255, 0.12);
      }

      .list {
        min-height: 0;
        padding: 8px 2px 0;
        display: grid;
        align-content: start;
        gap: 2px;
        overflow-y: auto;
        overscroll-behavior: contain;
        scrollbar-color: rgba(255, 255, 255, 0.18) transparent;
        scrollbar-width: thin;
      }

      .item {
        width: 100%;
        min-height: 68px;
        padding: 9px 10px;
        display: grid;
        grid-template-columns: 16px minmax(0, 1fr) auto;
        align-items: center;
        gap: 8px;
        border: 0;
        border-radius: 14px;
        color: inherit;
        background: transparent;
        text-align: left;
        cursor: pointer;
      }

      .item:hover {
        background: rgba(255, 255, 255, 0.075);
      }

      .item-icon {
        position: relative;
        width: 14px;
        height: 14px;
        display: grid;
        place-items: center;
        border-radius: 5px;
        color: var(--item-accent, #7d92ff);
        background: color-mix(in srgb, var(--item-accent, #7d92ff) 14%, transparent);
      }

      .item-icon::after {
        content: "";
        width: 3px;
        height: 3px;
        border-radius: 50%;
        background: currentColor;
        box-shadow: 0 0 4px currentColor;
      }

      .item-icon.running::before {
        content: "";
        position: absolute;
        inset: 2px;
        border: 1px solid transparent;
        border-top-color: currentColor;
        border-right-color: color-mix(in srgb, currentColor 35%, transparent);
        border-radius: 50%;
        animation: spin 1.1s linear infinite;
      }

      .item-icon.finished {
        --item-accent: #45d69a;
      }

      .item-icon.error {
        --item-accent: #ff6570;
      }

      .item-icon.permission {
        --item-accent: #ffc15a;
      }

      .item-copy {
        min-width: 0;
      }

      .item-title {
        display: block;
        overflow: hidden;
        color: rgba(255, 255, 255, 0.94);
        font-size: 13px;
        font-weight: 620;
        line-height: 18px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .item-body {
        display: block;
        overflow: hidden;
        margin-top: 3px;
        color: rgba(255, 255, 255, 0.5);
        font-size: 11px;
        line-height: 16px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .item-meta {
        min-width: 50px;
        display: grid;
        justify-items: end;
        gap: 5px;
      }

      .kind {
        padding: 3px 7px;
        border-radius: 7px;
        color: rgba(255, 255, 255, 0.65);
        background: rgba(255, 255, 255, 0.07);
        font-size: 10px;
        line-height: 14px;
      }

      .age {
        color: rgba(255, 255, 255, 0.34);
        font-size: 10px;
        font-variant-numeric: tabular-nums;
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
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
      <button id="summary" class="summary" type="button" aria-label="展开未读消息">
        <span class="brand-icon" aria-hidden="true">
          <svg viewBox="0 0 40 40" fill="none">
            <path
              d="M12 11.5h16a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H12a5 5 0 0 1-5-5v-10a5 5 0 0 1 5-5Z"
              fill="currentColor"
            />
            <path d="M14 8.5 17 12M26 8.5 23 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
            <rect x="12" y="17" width="5" height="5" rx="1.5" fill="#050509"/>
            <rect x="23" y="17" width="5" height="5" rx="1.5" fill="#050509"/>
            <path d="M14 26h12" stroke="#050509" stroke-width="2.5" stroke-linecap="round"/>
            <path d="M7 20H4M36 20h-3M13 31.5V35M27 31.5V35" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
          </svg>
        </span>
        <span class="notch-space" aria-hidden="true"></span>
        <span id="count" class="unread-count">0</span>
      </button>

      <section class="details" aria-label="未读消息详情">
        <header class="details-header">
          <div class="details-brand">
            <span class="brand-icon" aria-hidden="true">
              <svg viewBox="0 0 40 40" fill="none">
                <path
                  d="M12 11.5h16a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H12a5 5 0 0 1-5-5v-10a5 5 0 0 1 5-5Z"
                  fill="currentColor"
                />
                <path d="M14 8.5 17 12M26 8.5 23 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
                <rect x="12" y="17" width="5" height="5" rx="1.5" fill="#050509"/>
                <rect x="23" y="17" width="5" height="5" rx="1.5" fill="#050509"/>
                <path d="M14 26h12" stroke="#050509" stroke-width="2.5" stroke-linecap="round"/>
                <path d="M7 20H4M36 20h-3M13 31.5V35M27 31.5V35" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
              </svg>
            </span>
            <div class="details-heading">
              <div class="details-title">Paseo 未读消息</div>
              <div id="detailsSubtitle" class="details-subtitle"></div>
            </div>
          </div>
          <button id="clear" class="clear" type="button">清除</button>
        </header>
        <div id="list" class="list"></div>
      </section>
    </main>

    <script>
      (() => {
        const nativeHandler = window.webkit?.messageHandlers?.paseoIsland;
        let nativeStateListener = () => {};
        window.__PASEO_ISLAND_RECEIVE__ = (nextState) => nativeStateListener(nextState);
        const bridge = window.paseoIsland || {
          ready: () => nativeHandler?.postMessage({ type: "ready" }),
          onState: (listener) => {
            nativeStateListener = listener;
            return () => {
              if (nativeStateListener === listener) nativeStateListener = () => {};
            };
          },
          setExpanded: (expanded) =>
            nativeHandler?.postMessage({ type: "setExpanded", expanded }),
          action: (action, id) =>
            nativeHandler?.postMessage({ type: "action", action, id }),
        };

        const island = document.getElementById("island");
        const summary = document.getElementById("summary");
        const count = document.getElementById("count");
        const detailsSubtitle = document.getElementById("detailsSubtitle");
        const clear = document.getElementById("clear");
        const list = document.getElementById("list");
        let state = { expanded: false, items: [] };
        let expandTimer = null;

        const kindLabels = {
          running: "进行中",
          finished: "已完成",
          error: "错误",
          permission: "待处理",
          info: "消息",
        };

        const accentByKind = {
          running: "#8498ff",
          finished: "#45d69a",
          error: "#ff6570",
          permission: "#ffc15a",
          info: "#7d92ff",
        };

        const formatAge = (timestamp) => {
          const elapsedSeconds = Math.max(0, Math.floor((Date.now() - Number(timestamp || 0)) / 1000));
          if (elapsedSeconds < 60) return elapsedSeconds + "s";
          const minutes = Math.floor(elapsedSeconds / 60);
          if (minutes < 60) return minutes + "m";
          const hours = Math.floor(minutes / 60);
          if (hours < 24) return hours + "h";
          return Math.floor(hours / 24) + "d";
        };

        const render = (nextState) => {
          state = nextState && typeof nextState === "object" ? nextState : state;
          const items = Array.isArray(state.items) ? state.items : [];
          const current = items[0];
          const expanded = state.expanded === true && items.length > 0;

          island.classList.toggle("expanded", expanded);
          island.style.setProperty("--accent", accentByKind[current?.kind] || "#7d92ff");
          count.textContent = String(items.length);
          detailsSubtitle.textContent = items.length + " 条未读消息";
          clear.disabled = items.length === 0;

          list.replaceChildren(
            ...items.map((item) => {
              const row = document.createElement("button");
              row.type = "button";
              row.className = "item";
              row.addEventListener("click", () => bridge.action("open", item.id));

              const icon = document.createElement("span");
              icon.className = "item-icon " + item.kind;

              const copy = document.createElement("span");
              copy.className = "item-copy";
              const itemTitle = document.createElement("span");
              itemTitle.className = "item-title";
              itemTitle.textContent = item.title || "";
              const itemBody = document.createElement("span");
              itemBody.className = "item-body";
              itemBody.textContent = item.body || "";
              itemBody.hidden = !item.body;
              copy.append(itemTitle, itemBody);

              const meta = document.createElement("span");
              meta.className = "item-meta";
              const kind = document.createElement("span");
              kind.className = "kind";
              kind.textContent = kindLabels[item.kind] || kindLabels.info;
              const age = document.createElement("span");
              age.className = "age";
              age.textContent = formatAge(item.updatedAt);
              meta.append(kind, age);

              row.append(icon, copy, meta);
              return row;
            }),
          );
        };

        const cancelTimers = () => {
          if (expandTimer !== null) window.clearTimeout(expandTimer);
          expandTimer = null;
        };

        summary.addEventListener("click", () => {
          if (state.items.length > 0) bridge.setExpanded(true);
        });
        clear.addEventListener("click", () => bridge.action("clear"));
        document.body.addEventListener("mouseenter", () => {
          cancelTimers();
          if (state.items.length > 0 && state.expanded !== true) {
            expandTimer = window.setTimeout(() => {
              expandTimer = null;
              bridge.setExpanded(true);
            }, 80);
          }
        });
        document.addEventListener("keydown", (event) => {
          if (event.key === "Escape") bridge.setExpanded(false);
        });
        bridge.onState(render);
        bridge.ready();
      })();
    </script>
  </body>
</html>`;
}
