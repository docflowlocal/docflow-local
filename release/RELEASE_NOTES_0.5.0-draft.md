# DocFlow Local 0.5.0 — modular platform preview

> Draft only. Do not publish these notes or attach the current internal
> installers until the public release check passes.

DocFlow Local 0.5.0 begins the transition from a single desktop repository to a
four-layer document-automation platform:

- **DocFlow Core** for local JSON/CSV/Excel-to-DOCX generation, CLI automation,
  a loopback REST API, and trusted plugins;
- **Desktop Community** for visual field mapping, validation, batch generation,
  automatic naming, images, QR codes, signatures, and PDF delivery bundles;
- **DocFlow Pro** as a separately licensed private extension for relational
  data, approval checkpoints, audit records, watched folders, and commercial
  workflows;
- **DocFlow Hub**, reserved for a later team and cloud coordination layer.

## Highlights

- JSON input with nested arrays, in addition to CSV, XLSX, and XLSM.
- Versioned public request and plugin contracts with runtime schema validation.
- CLI `inspect`, `validate`, `generate`, and authenticated loopback `serve`
  commands.
- Streaming CLI output with staging, cleanup, deterministic collision handling,
  and bounded artifact count/output size.
- DOCX variables, table loops, conditions, number/date/currency formatters,
  images, QR codes, and signature assets.
- Desktop packaged-app smoke tests on macOS and Windows CI runners.
- Separate macOS and Windows release manifests; Windows binds the exact NSIS
  and portable executables after timestamped Authenticode verification.
- Six starter templates, three runnable workflows, and a transform plugin
  example.
- Offline Ed25519 license verification and public Desktop extension contracts.
- Bilingual product positioning and architecture documentation.

## Security and privacy

- Customer source files and generated documents remain local.
- The desktop engine binds only to loopback and requires a random Bearer token,
  valid Host, and valid Origin.
- Active PDF content, macro-enabled or externally linked DOCX content, unsafe
  field instructions, and high-compression archive payloads are rejected.
- Public source and installers must never contain license-signing private keys.

## Licensing transition

The historical 0.x desktop source remains
`AGPL-3.0-or-later`. Newly written contracts, verifier, extension SDK, CLI,
HTTP, and plugin-host files carry `MPL-2.0` notices. The current Core transition
package is accurately declared as:

```text
MPL-2.0 AND AGPL-3.0-or-later
```

Four inherited engine files remain AGPL. Do not describe or publish this Core
preview as pure MPL until every relevant rightsholder has granted relicensing
permission or those files have been independently replaced.

## Public release gates

Before replacing this draft:

- build from a reviewed, clean commit;
- complete the recorded provenance/legal review;
- create and verify the split public repositories;
- verify npm scope ownership and mandatory 2FA;
- run the packaged Windows smoke test;
- sign and timestamp Windows installers;
- sign the macOS app and installer with Developer ID, enable hardened runtime,
  notarize, and staple;
- embed only the controlled production license **public** key;
- generate the final CycloneDX SBOM, manifest, and checksums.

Use `npm run release:check:mac` and `npm run release:check:win` on their
matching release hosts. The split Desktop repository must have its own reviewed
registry-resolved lockfile; copying the transition workspace lock is blocked.

---

# DocFlow Local 0.5.0——模块化平台预览

> 本文件仍是草稿。公开发布检查通过前，不得发布本说明或上传当前内部测试安装包。

0.5.0 将 DocFlow Local 从单一桌面应用拆分为 Core、Desktop Community、Pro
和未来 Hub 四层。该版本新增 JSON 嵌套数据、版本化公共契约、CLI 与本地 API、
流式批量输出、插件接口、六套模板、三个完整示例，以及 Pro 的多表关联、审批、
审计和监控文件夹基础。

历史 0.x 桌面代码继续采用 AGPL-3.0-or-later；新编写的模块文件采用 MPL-2.0。
当前 Core 仍是 MPL 与 AGPL 混合许可，不能宣传为纯 MPL。正式发布还必须完成
权属审查、GitHub 拆仓、npm 2FA、Windows 实机测试、macOS/Windows 正式签名、
macOS 公证和生产许可证公钥配置。
