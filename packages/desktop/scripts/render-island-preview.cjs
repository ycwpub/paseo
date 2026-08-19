const fs = require("node:fs");
const path = require("node:path");
const { app, BrowserWindow } = require("electron");

const viewModulePath = process.argv[2] || path.resolve(__dirname, "../dist/island/island-view.js");
const { getIslandDocument } = require(viewModulePath);

const compactOutputPath = "/tmp/paseo-island-compact.png";
const expandedOutputPath = "/tmp/paseo-island-expanded.png";

async function renderPreview() {
  await app.whenReady();
  const window = new BrowserWindow({
    width: 520,
    height: 64,
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

  window.setSize(1000, 182);
  await window.webContents.executeJavaScript(`
    window.__PASEO_ISLAND_RECEIVE__({
      expanded: true,
      items: [{
        id: "preview",
        kind: "info",
        title: "Paseo 测试消息",
        body: "验证灵动岛展开态图标尺寸",
        updatedAt: Date.now()
      }]
    });
  `);
  await new Promise((resolve) => setTimeout(resolve, 250));

  const expandedMetrics = await window.webContents.executeJavaScript(`
    (() => {
      const headerIcon = document.querySelector(".details-brand .brand-icon").getBoundingClientRect();
      const itemIcon = document.querySelector(".item-icon").getBoundingClientRect();
      return {
        header: { width: headerIcon.width, height: headerIcon.height },
        item: { width: itemIcon.width, height: itemIcon.height }
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
