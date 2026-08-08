# DocFlow Local Community 0.6.0 — activation-first local workflows

> **Draft — not released.** This document describes the current 0.6.0 release
> candidate. It is not proof that an installer has been built, signed,
> notarized, deployed, or published.

DocFlow Local Community 0.6.0 makes the first useful result easier to reach and
the next real batch easier to repeat. Community remains a genuinely useful,
local-first product: no registration is required, customer documents are not
uploaded, generated files have no watermark, and usage is not priced or limited
by document count.

## What is new in Community 0.6.0

### Four guided industry starters

- Start with a sanitized **trade quotation**, **engineering handover**, **HR
  onboarding**, or **compliance package** workflow instead of an empty project.
- Each starter includes sample rows, field mappings, basic computed or
  conditional rules, multiple templates, naming/folder rules, and one deliberate
  missing value to repair through preflight.
- Starter activity is classified as sample use. Finishing a sample never counts
  as real activation or a product-qualified lead.

### Reusable local projects

- Save and reopen mappings, rules, template bindings, and output settings in a
  local `.docflow` project.
- Project writes are bounded and atomic, with recent-project handling designed
  for desktop use.
- Saved projects are a permanent Community capability. They are not paid run
  history, team governance, or an unattended automation queue.

### Privacy-reviewed shareable recipes

- Export and import a separate `.docflowrecipe` workflow recipe, then bind the
  recipient's own data and templates.
- The allowlisted recipe format excludes source rows, original source/template
  filenames, raw custom templates, project/customer names, customer literals,
  generated content, output files, signatures, and image assets.
- Export presents a human-readable preview and warning because field labels,
  formulas, and rule text may still contain confidential business information.
- Importing a recipe does not enable watched folders, schedules, connectors,
  plugins, network actions, or delivery actions.

### Local activation and PQL ledger

- Guided activation, real batches, real activation, repeat use, Pro-feature
  intent, and trial eligibility are evaluated on the device using a strict
  allowlist of coarse events.
- Real activation requires a successful batch made with the user's own data and
  template, confirmed mappings, a passing full preflight, a saved delivery
  package, and a saved project within seven days of first launch.
- Same-day retries are deduplicated using an installation-local HMAC. The ledger
  contains no document contents, cell values, names, paths, mappings, formulas,
  generated text, or document/template fingerprints.
- The local ledger is bounded, stored with restrictive permissions, and can be
  inspected, exported, or cleared by the user. This release does not turn the
  ledger into document telemetry or upload it.

### Safer image and dependency handling

- Core 0.1.1 removes the vulnerable third-party image dimension parser and uses
  a bounded local parser for the PNG/JPEG formats accepted by templates.
- Truncated and adversarial image headers fail quickly; the reviewed lockfile
  reports zero known npm vulnerabilities at release-review time.

## Community and Pro boundary

Community continues to include Excel/CSV/JSON import, Word/PDF field mapping,
basic formulas and conditions, basic multi-template delivery packages, automatic
naming and folders, preflight/integrity checks, saved projects, safe recipes,
the attended CLI, and the explicitly started authenticated loopback API.

The Community interface now contains a clearly gated Pro workspace and upgrade
entry. The **public Community 0.6.0 build does not contain the private Pro
adapter, commercial implementation, production license keyring, issuer private
keys, or unattended automation service**. Without that private module, Pro
operations fail closed and all Community projects and outputs remain usable.

The separately distributed **private Community + Pro combination** can add
licensed watched-folder runs, schedules, retry/recovery behavior, local run
history and audit records, advanced data/rule features, and commercial
connectors. Its document generation and automation execute locally. Licensing
requests never include source documents, templates, generated files, filenames,
or customer values.

These are different distributions with different release evidence and legal
terms. A Community source release or Community installer must not be described
as containing DocFlow Pro merely because the gated Pro interface is visible.

## 21-day Pro trial behavior

- Installation does not start a trial. A user becomes eligible only after the
  first real activation described above.
- The user must then explicitly request the trial. A successfully verified,
  installation-bound signed trial license activates Pro for exactly 21 days and
  has no grace period.
- Trial expiry disables only Pro commands. It does not delete, encrypt, hide,
  revoke, or watermark existing projects or generated files, and it does not
  prevent continued Community use.
- Trial issuance is available only in the private Pro-enabled distribution after
  its production licensing service and keys pass their own release gates. The
  public Community build alone cannot issue a Pro trial.

## Commercial model

DocFlow Local does **not** charge per generated document and Community output has
**no watermark**. Community is the permanent free entry point. Pro is paid for
unattended automation, advanced complexity, operational reliability, governance,
commercial connectors, and support; Business adds team administration and
centralized controls.

## Current public release gates

The following work must be completed and recorded before 0.6.0 is called a
public release:

- finish the complete Community regression, Core/package, export-boundary,
  desktop UI, PDF, API, and packaged-application smoke suites from a clean,
  reviewed split Community repository;
- reconcile the changelog, website download copy/URLs, release metadata, version
  numbers, checksums, SBOM, and repository-export evidence for 0.6.0;
- update the release-evidence record with verifiable references for the completed
  provenance/legal review and npm organization 2FA, then make every applicable
  platform gate pass;
- build the macOS artifact with a valid Developer ID signature and hardened
  runtime, submit it for Apple notarization, staple the ticket, and verify both
  the app and installer;
- complete Authenticode certificate provisioning, timestamped signing, and the
  packaged smoke test on a Windows release host before publishing Windows;
- restore authenticated GitHub and Cloudflare release/deployment access, run the
  fail-closed public release checks, and publish only the artifacts bound to the
  reviewed commit.

The private Community + Pro combination has additional gates: supplemental
legal/license review for the combined distribution; a controlled production
public-key keyring with issuer private keys kept outside source and artifacts;
production trial-service database, HMAC secret, origin/domain, abuse controls,
and operational review; Pro integration and packaged-app regression tests; and
platform signing/notarization evidence for the commercial installer.

No 0.6.0 deployment, signature, notarization, installer publication, or Pro
production-service launch is asserted by this draft.

---

# DocFlow Local Community 0.6.0——以激活为导向的本地工作流

> **草稿——尚未发布。** 本文描述当前的 0.6.0 候选版本，不代表安装包已经构建、
> 签名、公证、部署或公开发布。

DocFlow Local Community 0.6.0 让用户更快得到第一个可用结果，也更容易在下一次
真实业务中重复运行。Community 仍然是完整可用的本地优先产品：无需注册，不上传
客户文档，生成文件不加水印，也不按生成文档数量收费或限制使用量。

## Community 0.6.0 新增内容

### 四个行业引导 Starter

- 首次使用可直接选择经过脱敏的**外贸报价、工程移交、HR 入职、合规材料**工作流，
  无需从空白项目开始。
- 每个 Starter 都包含样例数据行、字段映射、基础计算或条件规则、多模板、命名与目录
  规则，以及一个需要通过预检修复的故意缺失字段。
- Starter 行为始终归类为样例使用；完成样例不会被计为真实激活或 PQL。

### 可复用的本地项目

- 可将字段映射、规则、模板绑定和输出设置保存为本地 `.docflow` 项目并重新打开。
- 项目写入有明确容量边界并采用原子写入，同时提供适合桌面端的最近项目处理。
- 保存项目是 Community 永久能力，不等同于收费的运行历史、团队治理或无人值守任务队列。

### 经过隐私边界审查的配方

- 可用独立的 `.docflowrecipe` 格式导入、导出工作流配方，接收方再绑定自己的数据和
  模板。
- 白名单式配方会排除源数据行、原始数据/模板文件名、原始自定义模板、项目/客户名称、
  客户字面量、生成内容、输出文件、签名和图片资产。
- 导出前会展示人类可读预览与提醒，因为字段标签、公式和规则文本仍可能包含业务机密。
- 导入配方不会自动启用监控目录、计划任务、连接器、插件、网络操作或交付动作。

### 仅保存在本机的激活与 PQL 账本

- 引导激活、真实批次、真实激活、重复使用、Pro 功能意向和试用资格均在本机依据严格
  白名单的粗粒度事件判断。
- 真实激活要求用户使用自己的数据和模板，确认映射，通过完整预检，成功保存交付包，
  并在首次启动后的七天内保存项目。
- 同一天的重复尝试会使用仅限本机的 HMAC 去重。账本不保存文档内容、单元格值、名称、
  路径、映射、公式、生成文本，也不保存文档或模板指纹。
- 账本容量受限，采用限制性权限保存，并允许用户查看、导出和清除。本版本不会把该账本
  变成文档遥测数据，也不会上传账本。

### 更安全的图片与依赖处理

- Core 0.1.1 移除了存在漏洞的第三方图片尺寸解析器，改用有边界的本地解析器处理模板
  实际接受的 PNG/JPEG 格式。
- 截断或恶意图片头会被快速拒绝；经过审查的锁文件在发布审查时报告零项已知 npm 漏洞。

## Community 与 Pro 的边界

Community 永久包含 Excel/CSV/JSON 导入、Word/PDF 字段映射、基础公式与条件、基础
多模板交付包、自动命名与目录、预检与完整性检查、本地项目、安全配方、前台手动调用的
CLI，以及由用户明确启动且带认证的回环 API。

Community 界面现在包含边界清晰的 Pro 工作区和升级入口，但**公开的 Community 0.6.0
构建不包含私有 Pro 适配器、商业实现、生产许可证公钥环、签发私钥或无人值守自动化
服务**。未安装私有模块时，Pro 操作会安全关闭，Community 项目和既有输出仍可正常使用。

另行分发的**私有 Community + Pro 组合包**可按许可证提供监控目录、计划任务、失败重试
与恢复、本地运行历史与审计记录、高级数据/规则能力及商业连接器。文档生成和自动化仍在
本机执行；许可证请求不会包含源文档、模板、生成文件、文件名或客户字段值。

两者是发布证据和法律条款均不同的发行物。不能因为界面中可见受控的 Pro 入口，就将
Community 源码发布或 Community 安装包描述为已经包含 DocFlow Pro。

## 21 天 Pro 体验规则

- 安装应用不会启动试用；用户必须先完成上述第一次真实激活，才具备试用资格。
- 随后仍需用户主动请求。只有成功校验的、绑定本机安装实例的签名试用许可证，才会开启
  正好 21 天的 Pro 能力，且没有宽限期。
- 试用到期只关闭 Pro 命令，不会删除、加密、隐藏、撤销项目或已生成文件，不会添加
  水印，也不会阻止继续使用 Community。
- 试用签发仅在私有 Pro 组合包的生产许可证服务与密钥通过各自发布门禁后提供；公开
  Community 构建本身不能签发 Pro 试用。

## 商业模式

DocFlow Local **不按生成文档数量收费**，Community 输出**不加水印**。Community 是
永久免费的入口；Pro 对无人值守自动化、高级复杂度、运行可靠性、治理、商业连接器和
支持收费；Business 进一步提供团队管理和集中控制能力。

## 当前公开发布门禁

在将 0.6.0 称为正式公开版本之前，必须完成并留存以下证据：

- 在干净且经过审查的拆分 Community 仓库中，通过完整的 Community 回归、Core/包、
  导出边界、桌面 UI、PDF、API 和打包应用冒烟测试；
- 将 CHANGELOG、官网下载文案与链接、发布元数据、版本号、校验和、SBOM 及仓库导出
  证据统一到 0.6.0；
- 在发布证据记录中补充已完成的来源/法务审查及 npm 组织 2FA 的可验证引用，并让目标
  平台的全部门禁通过；
- 用有效的 Developer ID 和 Hardened Runtime 构建 macOS 产物，提交 Apple 公证、
  装订公证票据，并同时验证应用和安装器；
- 在发布 Windows 前完成 Authenticode 证书配置、带时间戳签名，以及 Windows 发布机
  上的打包应用冒烟测试；
- 恢复 GitHub 与 Cloudflare 的已认证发布/部署权限，运行失败即关闭的公开发布检查，
  且只发布与已审查提交绑定的产物。

私有 Community + Pro 组合包还有额外门禁：完成组合发行物的补充法务/许可证审查；
注入受控的生产公钥环并确保签发私钥永远不进入源码和产物；完成生产试用服务的数据库、
HMAC 密钥、来源/域名、滥用控制和运维审查；通过 Pro 集成与打包应用回归测试；为商业
安装包留存目标平台的签名/公证证据。

本草稿不宣称 0.6.0 已部署、签名、公证或发布安装包，也不宣称 Pro 生产服务已上线。
