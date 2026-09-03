# Windows Self-Signed Preview / Windows 自签名预览版

## Release identity / 版本与证书

| Item / 项目 | Value / 内容 |
| --- | --- |
| Channel / 通道 | Self-Signed Preview — not publicly trusted / 自签名预览版，非公众可信签名 |
| Version / 版本 | `0.6.1-preview.2` |
| Architecture / 架构 | Windows x64 |
| Installer / 安装版 | `DocFlow-Local-Setup-0.6.1-preview.2-x64-Self-Signed-Preview.exe` |
| Portable / 便携版 | `DocFlow-Local-0.6.1-preview.2-Windows-x64-Self-Signed-Preview.exe` |
| Public certificate / 公开证书 | `DocFlow-Local-Preview-CodeSigning.cer` |
| Certificate subject / 证书主题 | `CN=DocFlow Local Community Preview` |
| SHA-1 certificate thumbprint / 证书指纹 | `3BDE0D54717DC1A0C7BB19B36B3C2B90A6C00337` |
| SHA-256 certificate fingerprint / 证书指纹 | `55A4AB626BD3C54E94161ADEF08B85C24E5E8A61B6CE8F4CB7DF15331F8B8114` |
| Certificate expires / 证书有效期截止 | `2027-03-02T15:58:36Z` (UTC) |

The certificate fingerprints identify the certificate, **not the installer
file**. The SHA-1 thumbprint is an identifier, not the file-signing digest.
Compare each executable with its own published SHA-256 checksum.

上述指纹用于识别证书，**不是安装包的文件哈希**。SHA-1 指纹仅作为证书标识，
不表示文件使用 SHA-1 签名。每个 EXE 都必须单独与该版本公布的 SHA-256
校验值核对。

## 中文说明

### 这是独立的 Preview 测试通道

此版本面向自有测试电脑或经组织 IT 批准的受管测试环境，不是公众可信签名的
正式 Windows 发行版。项目使用专用的自签名代码签名证书；它不是 SignPath
Foundation 签发的证书，也不代表 SignPath 申请已获批准。

自签名可用于核对文件签名与项目公布的证书是否一致，但不能提供第三方验证的
发布者身份，不能代替完整性校验、功能测试或安全审查，也不能满足正式商业
发布的公众可信签名门禁。不要移除文件名中的 `Self-Signed-Preview` 标识，
也不要将此包重新标注为正式版。

### Windows 安全提示仍可能出现

Microsoft Defender SmartScreen 对自签名证书的处理与未签名文件相同，可能
显示“Windows 已保护你的电脑”。安装了自签名证书不等于获得 SmartScreen
信誉。[微软：SmartScreen 信誉机制](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)

Smart App Control 的可信签名判断要求受信任提供商签发的证书，因此此 Preview
仍可能被阻止。不能承诺在开启 Smart App Control 的设备上运行。
[微软：Smart App Control 签名要求](https://learn.microsoft.com/en-us/windows/apps/develop/smart-app-control/code-signing-for-smart-app-control)

安装器和应用**绝不自动导入或信任证书**，不修改当前用户或本机的证书信任
存储，也不关闭、绕过或添加 Microsoft Defender、SmartScreen、Smart App
Control、防火墙或企业应用控制的例外。请勿为了安装本软件关闭这些保护。
如果受管设备或 Smart App Control 阻止运行，请停止安装，联系组织 IT，并
使用经过公众可信签名或 Microsoft Store 分发的版本；如该版本尚未提供，
请等待发布，不要尝试绕过策略。

### 公开证书不包含私钥

发布资产只提供 `.cer` 公开证书。不会向用户提供 `.pfx`、签名私钥或私钥密码，
也不需要用户提供自己的任何证书或密钥。私钥只用于受控的发布签名流程，
不得进入源码、安装包、日志或下载资产。
[微软：导出公开证书不包含私钥](https://learn.microsoft.com/en-us/powershell/module/pki/export-certificate)

不要因为证书主题名称看起来正确就信任下载。名称可被复制，必须同时核对
官方发布记录、EXE 的 SHA-256 和实际签名者证书指纹。发现不匹配、缺少签名、
文件损坏或证书过期时，应停止使用并联系维护者。

### 构建与验收

在 Windows x64 构建机上，从已审查的版本标签或完整提交 SHA 构建：

```powershell
npm ci
npm run build:win:self-signed-preview
```

此命令是独立 Preview 通道，不替代 `npm run build:win:release`，不会将
SignPath 或正式公众可信签名门禁改成“已完成”。私钥必须通过受控签名环境
提供，不能作为命令行示例中的明文参数或写进仓库。

产物名称遵循：

- `DocFlow-Local-Setup-${version}-x64-Self-Signed-Preview.exe`
- `DocFlow-Local-${version}-Windows-x64-Self-Signed-Preview.exe`

发布记录应包含准确的源码提交、构建记录、安装包 SHA-256、SBOM、此说明和
公开 CER。构建机针对固定证书进行的验证仅用于确认 Preview 的签名，不是
公众信任证明；不能据此宣称终端用户的 Windows 将自动信任此包。

`0.6.1-preview.2` 增加无人值守构建保护：单次签名命令限时 120 秒，打包后的
应用主进程检查限时 60 秒，超时则终止该进程树。日志分别标记打包完成、
smoke 进程退出、临时信任导入和签名验证。仅 GitHub 托管的临时 Windows
runner 可在签名后将固定公开证书加入 `LocalMachine\Root` 用于构建验证，
清理时仅移除该固定证书；`CurrentUser\My` 中的签名私钥也会被删除。
这些仅限构建机的措施不更改用户设备，不降低签名、RFC 3161 时间戳或证书
指纹门禁，也不代表先前构建等待的根因已得到确认。

## English

### A separate Preview channel

This build is intended for personally owned test computers or managed test
environments approved by organizational IT. It is not a publicly trusted
Windows production release. The project uses a dedicated self-signed
code-signing certificate. It is not a SignPath Foundation certificate and does
not indicate that the SignPath application has been approved.

A self-signed signature helps compare the signed file with the certificate
published by the project. It does not provide a third-party-verified publisher
identity, replace integrity checks, functional testing or security review, or
satisfy the publicly trusted signing gate for a formal commercial release.
Keep `Self-Signed-Preview` in every artifact name; do not relabel this build as
a production release.

### Windows security warnings can still occur

Microsoft Defender SmartScreen treats a self-signed certificate like an
unsigned file. Users may still see “Windows protected your PC.” Installing a
self-signed certificate does not establish SmartScreen reputation.
[Microsoft: SmartScreen reputation](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)

Smart App Control considers only certificates issued by trusted providers for
its trusted-signature check. It may still block this Preview; operation on a
device with Smart App Control enabled is not guaranteed.
[Microsoft: Smart App Control signing requirements](https://learn.microsoft.com/en-us/windows/apps/develop/smart-app-control/code-signing-for-smart-app-control)

The installer and application **never import or trust certificates
automatically**. They do not change current-user or local-machine trust stores,
disable security controls, bypass policy, or add exclusions for Microsoft
Defender, SmartScreen, Smart App Control, Windows Firewall, or enterprise
application control. Do not turn off those protections to install this app.
If a managed-device policy or Smart App Control blocks the Preview, stop,
contact IT, and use a publicly trusted signed or Microsoft Store-distributed
version. If no such version is available yet, wait for it rather than bypassing
the policy.

### Public certificate only; no private key

Release assets contain only the public `.cer` certificate. No `.pfx`, signing
private key, or private-key password is provided to users. Users do not need to
provide any certificate or key of their own. The signing private key belongs
only in the controlled signing environment, never in source, installers,
logs, or download assets.
[Microsoft: public certificate export excludes the private key](https://learn.microsoft.com/en-us/powershell/module/pki/export-certificate)

Do not trust a download just because its certificate subject looks correct:
subject names can be copied. Compare the official release record, executable
SHA-256 checksum, and actual signer thumbprint together. Stop and contact the
maintainer if they do not match, the signature is absent, the file is damaged,
or the certificate has expired.

### Build and verification

On a Windows x64 build host, build a reviewed version tag or full commit SHA:

```powershell
npm ci
npm run build:win:self-signed-preview
```

This is a separate Preview channel. It does not replace
`npm run build:win:release` or mark the SignPath/public-trust release gates as
complete. Provide the private key only through the controlled signing
environment, never as a plaintext example argument or committed file.

Artifact naming is:

- `DocFlow-Local-Setup-${version}-x64-Self-Signed-Preview.exe`
- `DocFlow-Local-${version}-Windows-x64-Self-Signed-Preview.exe`

The release record should contain the exact source commit, build record,
executable SHA-256 checksums, SBOM, this guide, and public CER. Verification
against the pinned certificate on a build host verifies the Preview signature;
it is not evidence of public trust and does not mean end-user Windows systems
will trust the package automatically.

`0.6.1-preview.2` adds unattended-build safeguards: a 120-second limit per
signing command and a 60-second limit for the packaged app's main smoke
process, terminating that process tree on timeout. Log markers distinguish
packaging completion, smoke-process exit, temporary trust import, and
signature verification. Only an ephemeral GitHub-hosted Windows runner may
temporarily add the pinned public certificate to `LocalMachine\Root` after
signing for build verification. Cleanup removes that exact certificate and
the signing private key in `CurrentUser\My`. These build-host-only measures do
not change user devices, weaken signature/RFC 3161 timestamp/fingerprint gates,
or claim that the cause of the previous build wait has been confirmed.

## Read-only download checks / 只读下载校验

Run these commands in the folder containing the downloaded EXEs. They read
file hashes and existing signatures only: they do not execute the app, install
certificates, or change Windows security settings.

在下载 EXE 所在目录执行以下命令。它们只读取文件哈希与已有签名，不会启动
应用、安装证书或修改 Windows 安全设置。

```powershell
$Files = @(
  '.\DocFlow-Local-Setup-0.6.1-preview.2-x64-Self-Signed-Preview.exe',
  '.\DocFlow-Local-0.6.1-preview.2-Windows-x64-Self-Signed-Preview.exe'
)

Get-FileHash -LiteralPath $Files -Algorithm SHA256

foreach ($File in $Files) {
  $Signature = Get-AuthenticodeSignature -LiteralPath $File
  $Signature | Format-List Path, Status, StatusMessage
  $Signature.SignerCertificate |
    Format-List Subject, Issuer, Thumbprint, NotBefore, NotAfter
}
```

- Compare each SHA-256 result with the checksum for that exact artifact in the
  official release. Do not compare it with the certificate fingerprint above.
- The signer `Thumbprint` must be
  `3BDE0D54717DC1A0C7BB19B36B3C2B90A6C00337`.
- On an unchanged Windows trust store, the chain may report `NotTrusted`
  because this is self-signed. That is not a successful public-trust result,
  and `NotTrusted` alone does not prove integrity or authenticity.
- A different signer, `HashMismatch`, `NotSigned`, an expired certificate, or
  mismatching file checksums is a reason to stop, not to bypass verification.
- These commands are not permission to run a package blocked by Windows or IT
  policy. Use a publicly trusted version in that situation.

对应中文说明：

- 每个 SHA-256 结果都应与官方发布中**该具体文件**的校验值一致，不要与上面的
  证书指纹比较。
- 签名者 `Thumbprint` 必须是
  `3BDE0D54717DC1A0C7BB19B36B3C2B90A6C00337`。
- 未改动信任存储的 Windows 可能因自签名链显示 `NotTrusted`。这不代表通过
  公众信任验证；单凭 `NotTrusted` 也不能证明文件完整性或来源真实性。
- 出现签名者不符、`HashMismatch`、`NotSigned`、证书过期或文件哈希不符，
  应停止使用，不得绕过校验。
- 完成上述检查不代表可以绕过 Windows 或组织 IT 的阻止策略；这种情况下
  应使用公众可信签名版本。

Reference / 参考：
[Get-FileHash](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/get-filehash)、
[Get-AuthenticodeSignature](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.security/get-authenticodesignature)。
