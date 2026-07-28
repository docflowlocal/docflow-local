# DocFlow Local 桌面构建

## 架构

桌面版由三层组成：

1. Electron 主进程管理应用窗口、单实例、文件保存、最近输出和本地 PDF 渲染；
2. Node 本地引擎在 `127.0.0.1` 随机端口提供数据导入、模板解析、校验和生成接口；
3. HTML/CSS/JavaScript 工作台作为沙箱化渲染进程运行。

渲染进程关闭 Node 集成，启用 `contextIsolation`、`sandbox` 和严格 CSP。Preload 只暴露有限的语言、会话与文件保存接口。所有 `/api/*` 请求都必须携带随机会话令牌，并通过 Origin/Host 检查。本地服务不监听局域网地址，应用退出后立即关闭。

## 从源码运行

需要 Node.js 22+ 和 npm：

```bash
npm ci
npm run desktop
```

macOS 可双击项目根目录的 `启动 DocFlow.command`，Windows 可运行 `start-docflow.bat`。如果 `node_modules/.bin/electron` 尚不存在，启动脚本会先执行 `npm ci`；两个脚本都不再依赖 Python、Flask、openpyxl 或 reportlab。

调试模式：

```bash
npm run desktop:debug
```

## macOS

Apple Silicon 构建：

```bash
npm ci
npm run build:mac
```

脚本先生成应用目录，再进行 ad-hoc 签名，最终输出 PKG 安装器和 ZIP 应用包。Intel Mac 可运行：

```bash
npm run build:mac:x64
```

ad-hoc 签名只适合本机测试。公开分发必须配置 Apple Developer ID Application/Installer 证书、启用 hardened runtime，并完成 notarization；不能把当前 `identity: null` 配置视为正式发布签名。

## Windows

必须在 Windows x64 构建机运行：

```powershell
npm ci
npm run build:win
```

构建结果包括 NSIS 安装包和 portable 便携版。公开发行必须配置可信的 Windows 代码签名证书；未签名构建可能触发 SmartScreen 警告。

## MVP 文档引擎

- 自定义 DOCX 使用 `{{字段}}`、条件区块和图片标记填充原始文档包，保留样式、表格、页眉页脚和页面设置；填充后的 DOCX 可选择随交付包保留。
- DOCX 会通过本地 Electron 渲染链转换为 PDF。它不是 Microsoft Word 渲染器，复杂 Word 功能必须用真实模板验收。
- PDF 模板会检查 AcroForm 字段，并填写文本、复选框、单选组、下拉框、列表以及图片/二维码字段；表单可选择扁平化。
- 静态非表单 PDF 只会复制，当前没有坐标设计器。
- 签名/印章是 PNG/JPEG 图片，不是证书数字签名。
- 每条记录可以生成多个模板；启用“合并 PDF”后，会额外生成该记录的合并文件。
- 生成过程会重新打开 PDF/DOCX，校验 ZIP 条目大小和 SHA-256，并写入校验报告及交付清单。

完整模板语法见 [README.zh-CN.md](README.zh-CN.md)。

## 测试

不启动 GUI 的检查：

```bash
npm run test:syntax
npm test
npm run test:api
```

这些测试覆盖安全表达式、规则依赖与财务取整、跨 Word run 的占位符、条件区块、图片/签名/二维码、恶意或高压缩比模板拒绝、DOCX 版式部件保留、PDF AcroForm 与中文字体、静态 PDF 保真、PDF 合并、API 会话与来源校验、CSV/XLSX 导入、字段映射、必填校验、自动目录、CSV 注入防护，以及中英文 ZIP 清单。

需要图形桌面会话的端到端 PDF 测试：

```bash
npm run test:pdf
npm run test:ui
```

`test:ui` 会真实启动 Electron，检查中英文切换、规则编辑、字段映射、签名添加/移除、完整校验以及侧栏/准备度区域的滚动定位，并输出一张界面验收截图。

依赖安全检查：

```bash
npm audit
```

## 发布前检查

- 在目标 macOS/Windows 架构上完成全部测试；
- 使用代表性的复杂 DOCX、AcroForm PDF 和中英文数据做视觉抽检；
- 确认输出 ZIP 可解压，校验报告、交付清单和合并 PDF 符合预期；
- 配置正式签名、notarization/时间戳并验证安装包；
- 使用合成数据测试，禁止把真实客户机密文件加入仓库或 CI 工件。
