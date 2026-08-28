# DocFlow Local

[English](README.md) · [官网](https://docflowlocal.com) · [实用指南](https://docflowlocal.com/zh/guides/) · [下载](https://docflowlocal.com/zh/download/) · [安全与隐私](https://docflowlocal.com/zh/security/) · [性能测试](BENCHMARKS.md)

DocFlow Local 是“文件不离开本机”的桌面文档自动化工具与模块化文档引擎。它把 JSON/Excel/CSV 数据与 Word/PDF 模板组合起来，完成字段映射、真实校验、批量生成、自动命名和交付打包。

> 客户文件只通过临时本机回环服务和应用内存处理；社区版不上传文档内容。

## MVP 已完成功能

- 导入 JSON、CSV、XLSX、XLSM，并将数据列映射到模板字段；保留原始物理行号以及 Excel 前导零、百分比等显示格式。
- 识别并填充自定义 DOCX，同时保留原文档包、样式、表格、页眉页脚和页面设置。
- 识别并填写 PDF AcroForm 文本框、复选框、单选组、下拉框、列表和图片字段。
- 在界面中新增、编辑和删除计算字段与条件字段；表达式由受限解析器执行，不使用 `eval`，也不执行任意 JavaScript。
- 每条有效记录可组合多个模板；自定义 DOCX 可保留填充后的 Word 文件，并可将该记录的多份 PDF 合并。内置报价单和附件均直接生成 PDF。
- 插入二维码、PNG/JPEG 图片以及图片形式的签名或印章。
- 使用字段规则自动命名、建立多级目录并打包为 ZIP。
- 校验映射后的必填字段、规则执行、模板有效性、PDF/DOCX 结构、ZIP 条目、文件大小和 SHA-256 校验和。
- 生成校验报告和 JSON 交付清单。
- 中文 / English 一键切换。

## 从源码快速启动

建议使用 Node.js 22+：

```bash
npm ci
npm test
npm run desktop
```

macOS 也可以双击 `启动 DocFlow.command`，Windows 可以运行 `start-docflow.bat`。两个入口都会在缺少 Electron 依赖时按锁定版本安装 npm 依赖，然后启动 Electron 客户端；不再启动已经废弃的 Python/Flask 原型。

首次体验可以导入脱敏示例 [`sample-data.csv`](sample-data.csv)。官网的 [Excel 批量生成 Word/PDF 指南](https://docflowlocal.com/zh/guides/batch-generate-pdf-from-excel/) 说明了记录、映射、校验、命名与打包模型。

macOS Apple Silicon 构建：

```bash
npm run build:mac
```

Windows x64 构建：

```powershell
npm ci
npm run build:win
```

完整测试和发布清单见 [DESKTOP_BUILD.md](DESKTOP_BUILD.md)。

## 可复现性能测试

运行确定性的本地引擎性能测试：

```bash
npm run benchmark:engine
```

测试覆盖100、500和1,000条记录的数据校验、自动命名、PDF完整性检查、ZIP打包、清单生成和校验和验证。它有意排除真实DOCX/HTML渲染，从而避免渲染器波动影响引擎管线对比。测试方法、环境、结果与解释边界见 [BENCHMARKS.md](BENCHMARKS.md)。

## DOCX 模板语法

DocFlow 会读取正文、页眉、页脚、脚注和尾注中的占位符。普通文本占位符可以跨多个 Word XML run。

| 用途 | 语法 | 示例 |
| --- | --- | --- |
| 文本或映射值 | `{{字段名}}` | `{{客户名称}}` |
| 条件区块 | `{{#条件字段}}...{{/条件字段}}` | `{{#显示优惠行}}优惠：{{优惠}}{{/显示优惠行}}` |
| 数组 / 表格循环 | `{{#项目}}...{{/项目}}` | `{{#项目}}{{名称}} — {{金额}}{{/项目}}` |
| 日期 / 数字格式 | `{{字段 \| 格式器}}` | `{{金额 \| currency:CNY}}` |
| 二维码 | `{{@qrcode:字段名}}` | `{{@qrcode:报价编号}}` |
| 普通图片 | `{{@image:字段名}}` | `{{@image:照片}}` |
| 签名或印章图片 | `{{@signature}}` | `{{@signature}}` |

为了让 Word 版式更稳定，建议将条件的开始/结束标记和每个图片标记分别放在独立段落或文本 run 中。图片数据单元格可以填写已上传图片的文件名，例如 `photo.png`；DocFlow 也会按文件名主体或引用字段名匹配图片。图片只支持 PNG 和 JPEG。

内置格式器包括 `date:YYYY-MM-DD`、`number:2`、`currency:CNY`、
`percent:1`、`trim`、`upper`、`lower` 和 `default:默认值`。JSON 数据可直接携带嵌套数组，用于表格循环。

示例：

```text
客户：{{客户名称}}
报价编号：{{报价编号}}

{{#显示优惠行}}
优惠：{{优惠}}
{{/显示优惠行}}

{{@qrcode:报价编号}}
{{@signature}}
```

## PDF AcroForm 命名约定

普通 AcroForm 字段名与 DOCX 字段一样参与映射。需要插入资源时，请建立表单字段——优先使用按钮字段——并使用以下名称：

- `@qrcode:报价编号`：根据该字段生成二维码。
- `@image:照片`：根据数据行中的值或已上传资源名匹配 PNG/JPEG。
- `signature`、`签名`、`stamp` 或 `印章`：插入已上传的签名/印章图片。

复选框会把 `1`、`true`、`yes`、`y`、`是`、`勾选`、`checked`（不区分大小写）视为选中。单选框、下拉框和列表的值必须与 PDF 中已经定义的选项一致。“扁平化 PDF 表单”默认开启，生成后字段不可继续编辑。

## 计算与条件规则

规则在客户端界面中创建。表达式支持字段名、数字和引号字符串、括号、`+ - * / % ^ **`、比较运算、`&&` / `||` / `!`、`AND` / `OR` / `NOT`、`且` / `或` / `非`，以及 `条件 ? 值1 : 值2`。可用函数为 `round`、`abs`、`ceil`、`floor`、`min`、`max`、`coalesce`。

字段名包含空格或与关键字/函数同名时，请使用方括号：

```text
round((数量 * 单价 - 优惠) * (1 + 税率), 2)
coalesce(优惠, 0)
[净金额] >= 1000 ? "优先" : "标准"
```

`13%`、`¥1,234.50` 等格式会在本机规范化。空值不会静默参与算术；确实需要默认值时请使用 `coalesce(字段, 默认值)`。非法表达式不会被忽略，而会成为对应数据行的明确校验错误。

## 隐私架构

Electron 主进程启动一个只监听 `127.0.0.1` 随机端口的临时 Node 引擎。每个 API 请求都需要内存中的会话令牌，并校验同源和 Host。渲染进程开启 `contextIsolation`、沙箱和严格 CSP，关闭 Node 集成；退出应用或关闭最后一个窗口后，本地引擎与临时模板都会关闭和清空。

详情见 [PRIVACY.md](PRIVACY.md) 和 [SECURITY.md](SECURITY.md)。

## 当前边界

- 没有 AcroForm 字段的静态 PDF 会按记录原样复制，但还不能在任意坐标写入内容；MVP 暂无 PDF 可视化坐标设计器。
- “签名”是嵌入的图片，不是基于证书的密码学数字签名或法律电子签名。
- DOCX 替换会保留原文档包和版式部件，但 PDF 转换并不是调用 Microsoft Word。复杂浮动对象、高级域、少见字体、宏及其他复杂 Word 功能可能出现渲染差异，应使用真实代表模板验证。
- 同一份 DOCX 转 PDF 时必须使用统一纸张尺寸和方向；混合分节尺寸会被明确拒绝，避免静默裁切。
- 可以读取 XLSM 数据，但绝不会执行其中的宏。
- DOCX 宏、嵌入对象、外部关系、DDE/INCLUDE/LINK 活动字段和 PDF 活动脚本会在导入时被拒绝。
- 内存版 MVP 单次最多生成 2,000 个文件、执行 1,000 份本地渲染，且交付内容解压前累计原始大小不超过 256 MB；更大的任务需要拆分批次。
- 交付包会校验文件结构和校验和，但 DocFlow 不对客户数据的业务语义或法律正确性作认证。
- Windows 二进制必须在 Windows 构建。商业公开发行前需完成 macOS Apple Developer ID 签名与 notarization，以及 Windows 代码签名。

## Community 与 Pro

DocFlow 正在拆分为四层：开源 Core 引擎、开源 Desktop Community、
私有 Pro 扩展，以及未来可选的 Hub。Core 免费提供 CLI、带鉴权的本地
API、模板语法和插件合同；Community 继续保留 0.x 已公开且真正有用的
本地工作流，不采用人为文档数量限额。

Pro 聚焦企业愿意为运营和治理购买的能力：多数据源关系、可视化设计器、
监控目录与计划任务、失败重试、审计与审批、商业连接器、团队模板治理、
部署控制、离线激活和商业支持。

商业版不会以隐藏遥测、上传客户文档或降低安全性作为付费条件。

## 项目文档

- [产品实用指南](https://docflowlocal.com/zh/guides/)
- [安全政策](SECURITY.md)
- [隐私架构](PRIVACY.md)
- [桌面端代码签名政策](https://github.com/docflowlocal/docflow-desktop/blob/main/CODE_SIGNING_POLICY.md)
- [性能测试方法和结果](BENCHMARKS.md)
- [桌面端构建与发布清单](DESKTOP_BUILD.md)
- [路线图](ROADMAP.md)
- [平台架构与多仓拆分](PLATFORM_ARCHITECTURE.md)
- [未发布版本变更记录](CHANGELOG.md)
- [模块化发布清单](RELEASE_CHECKLIST.md)
- [参与贡献](CONTRIBUTING.md)

## 参与贡献

请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。Bug 使用 Issues，使用问题、模板分享和产品讨论使用 Discussions。

## 许可证与品牌

历史 0.x 单体版本继续适用 GNU AGPL-3.0-or-later，既有授权不会被撤回。
全新编写的合同、许可证校验器、扩展 SDK 和模块文件按 MPL-2.0 准备；当前
Core 过渡包仍为混合许可，继承自历史引擎的文件继续适用 AGPL-3.0-or-later。
准确边界见 [NOTICE.md](NOTICE.md)。Community、Core、contracts 与
license verifier 不提供同一代码的闭源替代授权。私有 Pro 模块、商业模板包、
实施、培训、支持、SLA 与商标许可属于独立商业服务，不包含在 Community
安装包中。著作权许可与商标权相互独立，详见
[TRADEMARKS.md](TRADEMARKS.md)。商业产品与服务请联系
`support@roboai.tech`。
