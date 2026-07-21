# DocFlow Local

[English](README.md) · [官网](https://docflowlocal.com) · [下载](https://docflowlocal.com/zh/download/) · [安全与隐私](https://docflowlocal.com/zh/security/)

DocFlow Local 是一款“文件不离开本机”的桌面文档自动化工具。它把 Excel/CSV 数据与 Word/PDF 模板组合起来，完成字段映射、完整性校验、批量 PDF 生成、自动命名和交付打包。

> 客户文件只在本机回环地址和内存中处理；社区版不上传文档内容。

## 当前能力

- 导入 CSV、XLSX、XLSM；
- 识别 DOCX 中的 `{{字段名}}` 占位符；
- 字段映射、必填校验、条件字段和安全计算字段；
- 批量生成中英文报价单和项目附件 PDF；
- 二维码、签名和图片插入；
- 自动命名、客户目录和多模板组合；
- 跳过不完整记录，并生成校验报告与交付清单；
- 中文 / English 一键切换并记住本机语言偏好；
- 所有有效记录打包为 ZIP。

## 快速开始

需要 Node.js 22+：

```bash
npm ci
node desktop/smoke-test.js
npm run desktop
```

macOS Apple Silicon：

```bash
npm run build:mac
```

Windows x64：

```powershell
npm ci
npm run build:win
```

## Community 与 Pro

社区版将持续提供可实际使用的本地数据导入、映射、校验和文档生成能力。规划中的 Pro 能力包括原 Word 版式高保真生成、PDF 可视化字段设计、项目保存、规则编辑器、监控目录、CLI 批任务和企业支持。

商业版不会以隐藏遥测、上传客户文档或降低安全性作为付费条件。

## 隐私架构

Electron 主进程启动一个只监听 `127.0.0.1` 随机端口的临时 Node 引擎。渲染进程开启 `contextIsolation` 与沙箱，关闭 Node 集成；窗口退出后本地引擎自动关闭。

详情见 [PRIVACY.md](PRIVACY.md) 和 [SECURITY.md](SECURITY.md)。

## 当前边界

- 自定义 DOCX 可以识别占位符并加入映射，但生成阶段暂时使用内置 HTML/PDF 版式；
- PDF 坐标映射和 AcroForm 写入尚未实现；
- 当前多模板以“同一客户目录下生成多份 PDF”的方式组合；
- Windows 二进制需要在 Windows 构建机生成；
- 商业公开发布前需要完成 Apple Developer ID、notarization 与 Windows 代码签名。

## 参与贡献

请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。Bug 使用 Issues，使用问题、模板分享和产品讨论使用 Discussions。

## 许可证与品牌

社区版代码已按 GNU Affero General Public License v3.0 或更高版本发布。DocFlow Local 名称、Logo 和官方行业模板不包含在开源代码许可中，详见 [TRADEMARKS.md](TRADEMARKS.md)。OEM、闭源集成和企业商业许可请联系 `sales@docflowlocal.com`。
