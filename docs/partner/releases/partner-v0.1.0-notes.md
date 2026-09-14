# Partner 0.1.0 预发布

本版面向体验与验证，基于 Space 0.1.46-alpha.5 / KodaX 0.7.96-beta.1。Partner 插件需要兼容宿主；不能直接装进不支持当前 Partner Host API 的旧版 Space。

## 这一版有什么

- **16位专家**：7位岗位、9位任务。每位有头像、能力详情、任务示例和默认方法Skill；选择后在当前会话持续生效，可关闭方法、切换或移除，并支持重启恢复。
- 新增销售拜访顾问、招聘面试设计、新员工入职、HTML演示文稿制作；办公专家还覆盖文案、产品、研究、项目、数据、邮件、会议、汇报、SOP和知识整理。
- **13个连接器目录项**：飞书、腾讯文档、网易邮箱、QQ邮箱、企业微信、钉钉、腾讯会议、Notion、Airtable、Atlassian、Slack、Zoom、GitHub。各服务能力不同，连接器详情说明实际范围。
- 共享资料与成果详情、网页打开、当前会话授权范围；连接器操作位于输入框上方。
- 冷启动首页、关联真实专家与方法的六个任务入口、专家/连接器/工作资料入口、直接展开的任务侧栏；移除交付格式下拉框，插件采用组合方块图标。

## 下载与使用

1. Apple Silicon Mac下载 `KodaX-Space-Partner-0.1.0-arm64.zip`，解压运行其中的应用。该包未签名、未公证。
2. 下载 `kodax.partner-library-0.1.0.space-extension`，在应用的扩展管理中安装并启用，再进入Partner插件库。
3. 选择专家或连接器，填入实际任务后发送。连接器需要用户自己的账号配置与明确授权范围。
4. 本预发布采用手动下载更新；发布包的更新源指向本仓库，不使用上游Space更新源。

## 验证范围与已知限制

- 本地类型、改动文件lint、构建、归档及专家SDK/真实Electron流程已验证。首轮全量4,047项中5个旧目录/界面测试失败，已修正并定向通过；第二轮发现一项SDK隔离用例偶发失败，单独复测通过。最终统计见Release正文。
- Windows专项CI已通过；完整跨平台CI尚未运行。
- 当前提供macOS arm64和Windows x64体验包；Intel Mac与Linux尚未提供本次验证的安装包。
- 连接器目录存在不等于每个真实企业账号都已端到端验证。飞书之外的服务多数仍处于Preview；具体API/fixture/真实账号证据见各PF验收材料，不承诺所有服务已通过真实环境测试。
- 专家真实模型样板仍需人工复核数据、承诺和日期；HTML演示不等于原生PPTX，生成质量并非保证。
- 独立的PartnerWorkspace TSX服务端渲染旧测试仍有测试加载问题；它不在当前npm test脚本的TS测试集合中，真实Electron流程另有证据。未将其描述为已通过。
- 保留上游与第三方许可证、版权及来源；本次公开发布许可已由用户确认来自上游作者。

源码、独立插件及安装包属于Partner预发布，不代表已合入Space主线或通过全部生产环境验证。

## 本次验收记录

- 最终源码：`243bb2ea58151390c7be9c1a86fbe3c71ce98140`。
- 第二轮npm test：4047项，4042通过、4跳过、1失败；SDK连接器隔离用例单独复测通过，但整轮不计为零失败。
- 类型、改动文件lint、smoke build和Partner归档构建通过。
- 后续已补充workflow权限，Windows专项CI已通过；此前完整跨平台CI仍未运行。
- 下载后可用SHA256SUMS.txt核对附件。

- 最终发行包真实Electron隔离复测通过：4位新专家、默认方法开关、重载恢复、会话隔离和移除；使用控制模型，不冒称真实账号业务验收。


## Windows x64 下载（补充发布）

- **安装版**：`KodaX-Space-Partner-Setup-0.1.0-x64.exe`，适合正常安装使用。
- **免安装版**：`KodaX-Space-Partner-Portable-0.1.0-x64.exe`，无需安装即可运行；用户数据仍保存于用户目录，并非完全随程序移动。
- 两种版本均需安装并启用本Release的 `kodax.partner-library-0.1.0.space-extension`。
- `SHA256SUMS-Windows.txt`用于校验Windows附件；原有Mac及插件校验文件保持不变。
- [Windows构建与启动验证](https://github.com/poppersamhar/KodaX-Space-Partner/actions/runs/34209355634)通过：Windows runner安装依赖、类型检查、smoke build、原生打包、更新源校验、真实打包程序启动检查。构建使用已发布源码 `243bb2ea58151390c7be9c1a86fbe3c71ce98140`，未移动原tag。
- Windows包未签名；专项启动检查不等于已验证所有用户电脑或真实企业账号。
