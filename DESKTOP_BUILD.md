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

正式发布使用独立、失败即停止的构建链，不会复用 ad-hoc 配置：

```bash
npm run build:mac:release
```

发布脚本要求：

- `CSC_LINK`/`CSC_KEY_PASSWORD` 或钥匙串中的 `CSC_NAME` 提供 Developer ID
  Application 证书；
- `CSC_INSTALLER_LINK`/`CSC_INSTALLER_KEY_PASSWORD` 或
  `DOCFLOW_PKG_IDENTITY` 提供 Developer ID Installer 证书；
- 使用 `APPLE_API_KEY`、`APPLE_API_KEY_ID`、`APPLE_API_ISSUER`，Apple ID
  专用密码组合，或 `APPLE_KEYCHAIN`/`APPLE_KEYCHAIN_PROFILE` 三种方式之一
  提供完整公证凭据；
- 工作树干净，并且权属、GitHub 拆仓、npm 2FA 和生产许可证公钥证据已记录。

脚本启用 hardened runtime，使用
`build/entitlements.mac.plist`，由 electron-builder 完成签名和公证，再执行
packaged smoke、`codesign`、Gatekeeper、PKG 签名和 stapled ticket 验证。任何
证书、环境变量、证据或验收步骤缺失都会停止构建。证书私钥不得进入源码仓库。

CI 会根据 macOS runner 的真实 `process.arch` 构建同架构应用，再从打包后的
`app.asar` 运行 release smoke：

```bash
npm run test:packaged:mac:host
```

## Windows

必须在 Windows x64 构建机运行：

```powershell
npm ci
npm run build:win
```

构建结果包括 NSIS 安装包和 portable 便携版。正式公开发行必须配置公众可信的
Windows 代码签名证书；未签名或自签名的 Preview 不能视为已完成正式签名。

### 独立的 Self-Signed Preview 通道

当前 `0.6.1-preview.2` 可使用项目专用证书构建自签名测试版：

```powershell
npm ci
npm run build:win:self-signed-preview
```

产物必须保留明确的 Preview 名称：

- `DocFlow-Local-Setup-${version}-x64-Self-Signed-Preview.exe`
- `DocFlow-Local-${version}-Windows-x64-Self-Signed-Preview.exe`

公开证书为 `DocFlow-Local-Preview-CodeSigning.cer`，仅含公钥，不提供 PFX、
私钥或密码。此通道与仍待批准的 SignPath 申请独立，不使用 SignPath
Foundation 证书，也不能满足正式商业发布的公众可信签名门禁。

自签名在 SmartScreen 中与未签名文件的提示行为相同，Smart App Control
仍可能阻止运行。安装器和应用绝不自动导入或信任证书，不修改 Windows
信任存储，不关闭安全保护，也不添加 Defender 或其他安全工具的例外。
只在自有或经 IT 批准的测试环境使用；受管策略或 Smart App Control 阻止时，
应使用公众可信签名或 Microsoft Store 版本，不得关闭保护来运行 Preview。

证书指纹、有效期、双语风险说明，以及只读的 `Get-FileHash` /
`Get-AuthenticodeSignature` 核对步骤，见
[Windows 自签名 Preview 说明](release/WINDOWS_SELF_SIGNED_PREVIEW.md)。
默认 Windows 信任链可能显示 `NotTrusted`，这不代表通过公众信任验证。

无人值守 Preview 构建将单次签名命令限制为 120 秒，打包后的应用主进程检查
限制为 60 秒，并记录 packaging、smoke 进程退出、trust、verify 阶段标记。
仅在 GitHub 托管的临时 Windows runner 上，签名后验证会临时导入固定的公开
证书到 `LocalMachine\Root`，完成或失败时精确清理；签名私钥仍位于
`CurrentUser\My`，清理时同时删除私钥。这些操作不是安装器或应用的行为，
不会为用户设备修改信任设置，也不会免除签名、RFC 3161 时间戳或指纹校验。

### 正式公众可信签名通道

正式签名构建使用：

```powershell
npm run build:win:release
```

发布脚本要求 `WIN_CSC_LINK` 与 `WIN_CSC_KEY_PASSWORD`，或者 Windows
证书存储中的 `DOCFLOW_WIN_CERTIFICATE_SUBJECT`；同时必须设置与证书一致的
`DOCFLOW_WIN_PUBLISHER_NAME`。它强制使用 SHA-256 Authenticode 和 RFC 3161
时间戳，执行完整桌面/包消费测试与 packaged smoke，并对 NSIS 和 portable
产物逐个调用 `Get-AuthenticodeSignature`。缺少证书、发布证据、干净工作树
或有效签名时构建会失败。PFX 和密码只能来自受控 CI secrets 或发布机证书
存储，不得写入仓库。上述门禁不会因 Self-Signed Preview 构建成功而降低或
标记完成。

Windows 打包脚本会先生成 `win-unpacked` 目录，直接从打包后的
`app.asar` 启动本地引擎并运行 JSON 导入与鉴权健康检查。只有
`DOCFLOW_PACKAGED_SMOKE_OK` 成功退出后，脚本才继续生成 NSIS 和 portable
安装包。也可以只执行目录打包与冒烟检查：

```powershell
npm run pack:win
npm run test:packaged:win
```

该检查必须在 Windows 构建机或 `windows-latest` CI 上运行；macOS 本机只能
静态检查 PowerShell 脚本，不能替代真实 Windows 可执行文件验收。

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
npm run test:core
npm run test:packages
```

这些测试覆盖 Core CLI 与带鉴权的本地 API、JSON/CSV/XLSX
数据源、数组循环、格式器和插件合同，以及桌面端的安全表达式、规则依赖与
财务取整、跨 Word run 的占位符、条件区块、图片/签名/二维码、恶意或高压缩比
模板拒绝、DOCX 版式部件保留、PDF AcroForm 与中文字体、静态 PDF 保真、
PDF 合并、API 会话与来源校验、字段映射、必填校验、自动目录、CSV 注入防护，
以及中英文 ZIP 清单。

`test:packages` 会把四个公开包打成真实 npm tarball，在全新临时项目中安装，
再通过打包后的 `docflow` 命令完成 inspect、validate 和 generate。它同时拒绝
缺少独立 `LICENSE` 的 tarball。

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

供应链与发布证据检查：

```bash
npm run test:release
npm run release:check
npm run release:metadata
```

`release:check` 是公开发布门禁，未签名/未公证、脏工作树或人工证据未完成时
会以非零状态退出。`release:metadata` 只生成内部预览用的 CycloneDX SBOM 和
带安装包 SHA-256 的发布清单；正式发布脚本会在所有公开门禁通过后重新生成
最终版本。默认别名面向 macOS；Windows 使用
`npm run release:check:win` 与 `npm run release:metadata:win`。Windows
发布清单会绑定 NSIS 与 portable 两个 `.exe`，并要求在 Windows 主机完成
Authenticode 验证。

## 发布前检查

- 在目标 macOS/Windows 架构上完成全部测试；
- 确认 macOS 与 Windows 的 packaged release smoke 均从打包产物成功退出；
- 使用代表性的复杂 DOCX、AcroForm PDF 和中英文数据做视觉抽检；
- 确认输出 ZIP 可解压，校验报告、交付清单和合并 PDF 符合预期；
- 确认 Electron 产物包含根 `LICENSE`、`NOTICE.md`、完整 MPL 文本和模板
  attribution notice；四个 npm tarball 均包含独立可读的许可材料；
- 在 provenance/relicense 或独立重写完成前，不得把当前混合许可 Core
  过渡包标注或发布为“纯 MPL”；
- 配置正式签名、notarization/时间戳并验证安装包；
- 使用合成数据测试，禁止把真实客户机密文件加入仓库或 CI 工件。
