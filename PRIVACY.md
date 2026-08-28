# Privacy Policy for the Community Edition

Last updated: 2026-08-29

DocFlow Local is designed to process customer documents on the user's computer.

## Document processing

- Imported spreadsheets, templates, signatures, generated PDFs, and ZIP packages are processed locally.
- The desktop engine listens only on a random `127.0.0.1` loopback port.
- Uploaded document content is held in local process memory for the active operation and is not sent to DocFlow Local servers.
- Generated files are written only to locations selected by the user or the operating system's download flow.

## Network activity

The Community Edition may eventually check for signed software updates. Any update request must be documented and must not include document names, field values, customer names, or generated content.

Usage analytics are not enabled in the current Community Edition. If optional diagnostics are introduced, they must be opt-in, documented, and exclude document content and identifying file metadata.

A future release may keep a bounded local-only milestone ledger to resume
onboarding, deduplicate successful batches, decide whether to offer a Pro
trial, and show value on the same device. A local ledger is not permission to
transmit data. It must use the allowlist, retention controls, and the controls
to inspect, export, and clear data defined in
[Activation, qualification, trial, and telemetry contract](docs/activation-and-telemetry.md).

Any future telemetry sender must remain disabled until the user makes a
separate, informed opt-in choice. Uploaded diagnostics may contain only the
daily aggregate fields in that contract. In particular, DocFlow must not send
file or folder names, paths, source rows, customer values, field or column
names, mappings, formulas, template contents, generated content, document
counts, workflow/input/template hashes, license identifiers, or hardware
identifiers.

Starting a trial, asking for sales contact, and opting into product diagnostics
are separate choices. None implies either of the others.

## Website

The public website is hosted by Cloudflare. Cloudflare may receive standard
request data such as IP address, user agent, referrer, requested URL, and
request timestamp for delivery, security, and operational logging.

Google Analytics 4 (measurement ID `G-77MP7J9XFT`) is optional and is loaded
only after a visitor chooses **Accept analytics**. Choosing **Decline** leaves
Google Analytics unloaded. A browser Do Not Track signal defaults analytics to
declined. The choice is stored locally in the browser and can be changed from
the website's **Analytics settings** control.

When accepted, Google LLC may receive standard browser and request information
and the following site interaction data:

- page path, page type, language, referrer, and recognized campaign or AI
  referral source;
- CTA identifiers, placement, destination category, plan, industry, and
  platform;
- public installer asset metadata such as release version, file name,
  extension, public link, and link domain;
- an optional supporter tier amount, currency, and whether the payment channel
  is live or coming soon.

This data is used to understand acquisition, downloads, and support-flow
performance. Website analytics does not receive document contents, templates,
spreadsheet rows, field values, customer data, local file names or paths, or
the desktop application's local activity ledger. Advertising personalization
and Google Signals are disabled in the site configuration. Google processes
accepted analytics data under its own privacy terms and the retention settings
configured in the DocFlow Local GA4 property. Aggregated reports may be kept
for product analysis.

The current supporter action opens a prefilled email and does not take payment.
If a visitor sends that email, the message, sender address, and any information
the visitor chooses to include are processed by the relevant email providers
for responding to the request. Any future checkout provider must be identified
and accompanied by a separate notice before payment information is collected.

## 中文说明

DocFlow Local Community 的表格、模板、签名、生成文件和交付包均在用户电脑
本机处理，不会发送到 DocFlow Local 服务器。桌面端本地使用记录默认不上传，
网站分析也不会读取桌面端文件或记录。

官网由 Cloudflare 托管。Cloudflare 可能为内容分发、安全防护和运行日志接收
IP 地址、浏览器标识、来源页、访问 URL 和时间等标准请求信息。

Google Analytics 4（衡量 ID：`G-77MP7J9XFT`）仅在访客主动选择
**接受分析统计**后加载；选择**拒绝**时不会加载。浏览器启用 Do Not Track
时默认视为拒绝。选择结果仅保存在当前浏览器中，并可通过官网底部的
**分析统计设置**重新修改。

用户同意后，Google LLC 可能接收标准浏览器/请求信息，以及页面路径、页面
类型、语言、来源渠道、按钮位置和目标类别、公开安装包元数据，以及用户在
支持页面主动选择的支持金额档位、币种和支付通道状态。这些信息仅用于分析
获客、下载和支持流程，不包含文档正文、模板、表格数据、字段值、客户资料、
本地文件名/路径或桌面端本地活动记录。官网配置已关闭广告个性化和 Google
Signals。Google 按其隐私条款及 DocFlow Local GA4 属性的保留设置处理已同意
的数据，汇总统计结果可能用于长期产品分析。

当前支持按钮仅打开预填邮件，不会扣款。用户主动发送后，邮件地址、正文及
用户自行填写的信息会由相关邮件服务商处理，以便回复支持意向。未来接入支付
服务商前，将先明确服务商和相应隐私提示。

## Contact

Privacy questions: `privacy@docflowlocal.com`
