const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");
const { parseTabular, generateBundle } = require("./engine");

app.disableHardwareAcceleration();

function renderPdf(html) {
  return new Promise((resolve, reject) => {
    const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    const close = () => { if (!window.isDestroyed()) window.destroy(); };
    window.webContents.once("did-fail-load", (_event, code, description) => {
      close();
      reject(new Error(`${code}: ${description}`));
    });
    window.webContents.once("did-finish-load", async () => {
      try {
        const pdf = await window.webContents.printToPDF({ pageSize: "A4", printBackground: true, preferCSSPageSize: true });
        close();
        resolve(pdf);
      } catch (error) {
        close();
        reject(error);
      }
    });
    window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  });
}

app.whenReady().then(async () => {
  const root = path.join(__dirname, "..");
  const parsed = await parseTabular("sample-data.csv", fs.readFileSync(path.join(root, "sample-data.csv")));
  const bundle = await generateBundle({
    rows: parsed.rows,
    requiredFields: ["客户简称", "客户名称", "报价编号", "联系人", "邮箱", "产品名称", "数量", "单价"],
    computedFields: [
      { name: "小计", expression: "数量 * 单价" },
      { name: "税额", expression: "(数量 * 单价 - 优惠) * 税率" },
      { name: "含税总额", expression: "round((数量 * 单价 - 优惠) * (1 + 税率), 2)" }
    ],
    templates: ["quote", "attachment"],
    settings: { filenamePattern: "{{客户简称}}-报价单-{{报价编号}}", folderPattern: "{{客户简称}}/{{报价编号}}" }
  }, renderPdf);
  const output = process.env.DOCFLOW_SMOKE_OUTPUT || path.join(root, "desktop-smoke.zip");
  fs.writeFileSync(output, bundle.buffer);
  console.log(JSON.stringify({ output, bytes: bundle.buffer.length, generated: bundle.generated.length, skipped: bundle.validation.invalid }));
  app.quit();
}).catch(error => {
  console.error(error);
  app.exit(1);
});
