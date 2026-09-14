# Connector brand assets

## Feishu

`feishu.png` is the unmodified transparent 700 × 700 PNG published by
[Feishu Open Platform](https://open.feishu.cn/) and referenced by its home page:

https://lf-package-cn.feishucdn.com/obj/feishu-static/lark/open/website/share-logo.png

Retrieved on 2026-08-31. The Feishu logo remains the property of its owner and is
used only to identify the Feishu connector, not to imply endorsement.

The trusted renderer imports this local asset. The independent Partner library
embeds the same bytes as a PNG data URL so it remains self-contained and does
not contact a third-party image server. Its archive test checks the embedded
bytes against this file; replace both together when updating the brand asset.

## Additional read-only connectors (2026-09-01)

These official PNG files are unmodified and used only to identify their respective
services. All trademarks belong to their owners; no endorsement is implied.
Both the renderer and the independent offline HTML use identical asset bytes.

| Local file            | Size      | Official source                                                                                                                                                                                             |
| --------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wecom.png`           | 48 × 48   | [Enterprise WeChat homepage favicon](https://wwcdn.weixin.qq.com/node/wwnl/wwnl/style/images/independent/favicon/favicon_48h$c976bd14.png), referenced by [work.weixin.qq.com](https://work.weixin.qq.com/) |
| `dingtalk.png`        | 200 × 200 | Official DingTalk homepage asset; exact URL and SHA-256 in [provider evidence](../../docs/partner/features/f146-dingtalk-evidence.md)                                                                       |
| `tencent-meeting.png` | 128 × 128 | [Tencent Meeting homepage logo](https://cdn.meeting.tencent.com/assets/next-website/logo128.png), referenced by [meeting.tencent.com](https://meeting.tencent.com/)                                         |

## Hosted MCP and app-registration connectors (2026-09-02)

`notion.svg`, `atlassian.svg`, `airtable.svg`, and `zoom.svg` are verbatim files
from [Simple Icons 16.21.0](https://github.com/simple-icons/simple-icons/tree/16.21.0/icons),
whose repository is distributed under CC0-1.0. They are used only to identify
their respective connectors; the service names and marks remain the property of
their owners and no endorsement is implied.

Slack intentionally uses the generic connector glyph in this release. Slack's
[official Media Kit](https://slack.com/media-kit) provides marks under its brand
terms, but no individual distributable logo file was added to this repository.
The credential-based connector retains that generic glyph; enabling its API
implementation does not fabricate or replace a brand asset.

## Tencent Docs, NetEase Mail and QQ Mail (2026-09-07)

These unmodified official assets identify the service and do not imply endorsement.
The renderer imports local files; the independent HTML embeds the identical bytes.

| Local file         | Official source                                                                                                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tencent-docs.svg` | The 48 × 48 `footer-logo` SVG embedded in [Tencent Docs homepage stylesheet](https://docs.gtimg.com/home/css/index-0ab84d.css), referenced by [docs.qq.com](https://docs.qq.com/). The SVG was decoded without altering its contents. |
| `netease-mail.png` | [NetEase Mail homepage favicon](https://mail.163.com/favicon.ico), referenced by [mail.163.com](https://mail.163.com/). The provider serves PNG bytes at an `.ico` URL; the local extension reflects the actual format.               |
| `qq-mail.png`      | [QQ Mail 96 × 96 favicon](https://res.wx.qq.com/t/webmail/webmail/res/static/images/qqmail_favicon_96h.8d124a7.png), referenced by [mail.qq.com](https://mail.qq.com/).                                                               |

- `github.svg`: GitHub 官方 Brand Toolkit `GitHub_Logos.zip` 内的 `SVG/GitHub_Invertocat_Black.svg`，2026-09-07 下载；[来源与使用约定](https://brand.github.com/foundations/logo)。仅在 GitHub 连接器旁标识集成，保留原始 SVG。
