# DocFlow Local 桌面构建

## 架构

桌面版由三层组成：

1. Electron 主进程管理应用窗口、单实例和 PDF 打印；
2. Node 本地引擎在 `127.0.0.1` 随机端口提供导入、校验和生成接口；
3. 现有 HTML/CSS/JavaScript 工作台作为沙箱化渲染进程运行。

渲染进程关闭了 Node 集成，启用 `contextIsolation` 与 `sandbox`；本地服务不监听局域网地址，也不会持久化上传内容。

## macOS

需要 Node.js 22+。Apple Silicon 构建：

```bash
npm ci
npm run build:mac
```

脚本会生成 ad-hoc 签名的 PKG 安装器和 ZIP 应用包。用于公开分发时，请在 electron-builder 配置中移除 `identity: null`，配置 Apple Developer ID Application/Installer 证书，并增加 notarization 环境变量。

Intel Mac 可运行：

```bash
npm run build:mac:x64
```

## Windows

在 Windows x64 构建机运行：

```powershell
npm ci
npm run build:win
```

构建结果包括 NSIS 安装包和 portable 便携版。正式发行建议配置 Windows 代码签名证书。

## 测试

不启动 GUI 的核心烟雾测试：

```bash
node desktop/smoke-test.js
npm audit --omit=dev
```

测试覆盖 CSV、XLSX、跨 Word run 的占位符、计算规则、必填校验、自动目录，以及中英文 PDF 与 ZIP 文件清单。

## 当前边界

- 自定义 DOCX 字段可以识别并加入映射表，但生成阶段仍使用内置 HTML/PDF 版式；
- PDF 坐标映射和 AcroForm 写入尚未实现；
- Windows 安装包必须在 Windows 构建机生成，本次交付包含完整构建配置但没有跨平台二进制。
