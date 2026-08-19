const fs = require("node:fs");
const path = require("node:path");
const { app, BrowserWindow } = require("electron");

const viewModulePath = process.argv[2] || path.resolve(__dirname, "../dist/island/island-view.js");
const { getIslandDocument } = require(viewModulePath);

const compactOutputPath = "/tmp/paseo-island-compact.png";
const expandedOutputPath = "/tmp/paseo-island-expanded.png";
const compactHeight = 38;
const expandedWidth = 480;

async function renderPreview() {
  await app.whenReady();
  const window = new BrowserWindow({
    width: 320,
    height: compactHeight,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(getIslandDocument())}`);
  await window.webContents.executeJavaScript(`
    window.__PASEO_ISLAND_RECEIVE__({
      expanded: false,
      items: [{
        id: "preview",
        kind: "info",
        title: "Paseo 测试消息",
        body: "验证灵动岛紧凑态图标尺寸",
        updatedAt: Date.now()
      }]
    });
  `);
  await new Promise((resolve) => setTimeout(resolve, 250));

  const compactMetrics = await window.webContents.executeJavaScript(`
    (() => {
      const icon = document.querySelector(".summary .brand-icon").getBoundingClientRect();
      return { width: icon.width, height: icon.height };
    })()
  `);
  const compactImage = await window.capturePage();
  fs.writeFileSync(compactOutputPath, compactImage.toPNG());

  window.setSize(expandedWidth, 220);
  await window.webContents.executeJavaScript(`
    window.__PASEO_ISLAND_RECEIVE__({
      expanded: true,
      items: Array.from({ length: 4 }, (_, index) => ({
        id: "preview-" + index,
        kind: index === 0 ? "permission" : "info",
        title: "Paseo 测试消息 " + (index + 1),
        body: "验证两条消息可见，更多消息可滚动",
        updatedAt: Date.now() - index * 1000
      }))
    });
  `);
  await new Promise((resolve) => setTimeout(resolve, 250));

  const expandedMetrics = await window.webContents.executeJavaScript(`
    (() => {
      const headerIcon = document.querySelector(".details-brand .brand-icon").getBoundingClientRect();
      const title = document.querySelector(".details-title");
      const itemIcon = document.querySelector(".item-icon").getBoundingClientRect();
      const list = document.querySelector(".list");
      return {
        header: { width: headerIcon.width, height: headerIcon.height },
        title: {
          clientWidth: title.clientWidth,
          scrollWidth: title.scrollWidth,
          fullyVisible: title.scrollWidth <= title.clientWidth
        },
        item: { width: itemIcon.width, height: itemIcon.height },
        list: {
          clientHeight: list.clientHeight,
          scrollHeight: list.scrollHeight,
          scrollable: list.scrollHeight > list.clientHeight
        }
      };
    })()
  `);
  const expandedImage = await window.capturePage();
  fs.writeFileSync(expandedOutputPath, expandedImage.toPNG());

  console.log(
    JSON.stringify({
      compactOutputPath,
      expandedOutputPath,
      compactMetrics,
      expandedMetrics,
    }),
  );
  window.destroy();
  app.quit();
}

void renderPreview().catch((error) => {
  console.error(error);
  app.exit(1);
});
