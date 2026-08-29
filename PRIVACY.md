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

Optional one-time support payments use Stripe-hosted Payment Links. Opening or
completing a Stripe checkout causes Stripe, Inc. and its affiliates to process
information needed to operate and secure the payment service. Depending on the
payment method and jurisdiction, this can include the payment email address,
payment-method details, billing information, IP address, device and browser
information, cookies, and fraud-prevention signals.

Stripe may make the support amount, currency, payment status, receipt email,
limited billing information, and masked payment-method details available to the
DocFlow Local merchant account. Card entry and payment processing occur on
Stripe's hosted page: the DocFlow Local website and desktop application do not
receive or store the full card number, card security code, or raw payment
credentials. Stripe handles this information under the
[Stripe Privacy Policy](https://stripe.com/privacy). No document contents,
templates, spreadsheet rows, generated files, or desktop activity are sent to
Stripe through the supporter flow. Supporting is optional and does not unlock
additional Community features or licence rights.

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

可选的一次性支持付款使用 Stripe 托管的 Payment Links。打开或完成 Stripe
结账时，Stripe, Inc. 及其关联方会为提供和保护支付服务而处理必要信息。根据
付款方式和所在地区，这些信息可能包括付款邮箱、支付方式信息、账单信息、
IP 地址、设备与浏览器信息、Cookie 以及反欺诈信号。

Stripe 可能向 DocFlow Local 的商户账户提供支持金额、币种、付款状态、收据
邮箱、有限的账单信息及经过掩码处理的支付方式信息。卡片信息输入和支付处理
均在 Stripe 托管页面完成；DocFlow Local 官网和桌面应用不会接收或保存完整
卡号、银行卡安全码或原始支付凭据。Stripe 按
[Stripe 隐私政策](https://stripe.com/privacy)处理这些信息。支持流程不会向
Stripe 发送文档正文、模板、表格数据、生成文件或桌面端活动记录。一次性支持
完全自愿，不会解锁额外的 Community 功能或许可权益。

## Contact

Privacy questions: `privacy@docflowlocal.com`
