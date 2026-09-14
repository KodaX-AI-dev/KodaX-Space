# F146 腾讯会议：首批受限只读连接器证据

核实日期：2026-09-01。仅官方文档、官方源码和官方发布包静态核验；本轮未登录、授权或执行真实会议业务。

## 官方入口与固定版本

- [腾讯会议官方 CLI 使用说明](https://meeting.tencent.com/support/topic/2236/index.html)；[官方源码仓库](https://github.com/TencentCloud/tencentmeeting-cli)。官方当前说明区分个人/专业版开放与商业/企业版灰度，实际资格以授权页为准。
- 固定 [v1.0.15 release](https://github.com/TencentCloud/tencentmeeting-cli/releases/tag/v1.0.15)，发布日期 2026-08-07，tag 源码提交前缀 `0407d61`。不跟随 latest。
- 发布包 [@tencentcloud/tmeet 1.0.15 元数据](https://registry.npmjs.org/@tencentcloud%2Ftmeet/1.0.15)；固定 [npm tarball](https://registry.npmjs.org/@tencentcloud/tmeet/-/tmeet-1.0.15.tgz)。此版本 GitHub release 无独立二进制 assets。
- tarball SHA512（base64）：`lMvcaNgEujhYk7RNakghdyjk5VukEeHrJOlpTenNhyiNuBcCEa9XtW8pYMQQDcxltAQpT9omGogkaXXAakN10w==`。
- 首批只提取 `package/dist/tmeet-macOS-AppleSilicon`，6,978,882 bytes，SHA256：`f245226550cda8e1ea8b6e6bafbead2fb91e6e823b52905f5bb1cae485ec3914`。完整包的 SHA512 与 registry 元数据一致后，再计算原生文件 SHA256。
- 安装复用宿主共享的有界下载、精确 tar 清单、常规文件限定与原子发布。不执行 npm、postinstall、cleanup.js 或 tmeet.js；官方 wrapper 存在共用临时缓存，宿主不走该路径。
- 目标：`<root>/tencent-meeting-cli/cli/1.0.15/darwin-arm64/tmeet`。每次执行前重新校验原生文件完整性；仅显式安装确认可下载。首次 inspect 缺失组件时既不下载，也不生成账号目录。

## 授权与真实在线身份

来源：[login.go](https://github.com/TencentCloud/tencentmeeting-cli/blob/v1.0.15/cmd/auth/login.go)、[auth.go](https://github.com/TencentCloud/tencentmeeting-cli/blob/v1.0.15/internal/auth/auth.go)、[status.go](https://github.com/TencentCloud/tencentmeeting-cli/blob/v1.0.15/cmd/auth/status.go)、[root.go](https://github.com/TencentCloud/tencentmeeting-cli/blob/v1.0.15/cmd/root.go)。

| 用途         | 固定命令 / 已验证输出                                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 固定版本     | `tmeet --version`，Cobra 输出 `tmeet version v1.0.15`                                                                                             |
| 官方网页登录 | `tmeet auth login --no-browser`                                                                                                                   |
| 授权地址     | stdout 的 `authorize url: https://meeting.tencent.com/marketplace/tencentmeeting-cli-auth.html?code=<opaque-code>`；唯一 code，无额外键或跳转地址 |
| 完成标志     | stdout 的固定 `Login successful. Start managing your meetings using tmeet.`，之后仍须在线校验                                                     |
| 在线校验     | `tmeet auth status`；这是纯文本，不是 JSON，不能擅加 JSON schema                                                                                  |

官方授权轮询周期 5 秒，授权等待上限 5 分钟。宿主显示 5 分钟过期时间，进程硬上限 330 秒，取消终止受控进程；迟到成功不得进入 verifying/connected。官方无 scope 选择参数或 granted-scope 输出，本实现不虚构 scopes，也不将本地只读限制说成 OAuth 只读授权。

`auth status` 即使打印 `Logged in`，也可能未在线获取身份。源码中在线 `POST /v1/cli/get-user-info`（operator_id 为当前 OpenId、operator_id_type=2）失败只警告。因此必须同时验证明确 OpenId、非空在线 UserName、AccessToken 和 RefreshToken 的 valid 行；缺任一项都不生成 identity。`authorityId: tencent-meeting` 是宿主服务命名空间，**不是**从平台读出的 appId；`subjectId` 是官方当前 OpenId。

## 隔离边界与平台限制

来源：[config.go](https://github.com/TencentCloud/tencentmeeting-cli/blob/v1.0.15/internal/config/config.go)、[user.go](https://github.com/TencentCloud/tencentmeeting-cli/blob/v1.0.15/internal/config/user.go)、[keychain 目录](https://github.com/TencentCloud/tencentmeeting-cli/tree/v1.0.15/internal/core/keychain)。

- 宿主生成随机 `space-UUIDv4`，同时设置 `TMEET_CLI_CONFIG_DIR=<profile>/config`、`TMEET_CLI_DATA_DIR=<profile>/data`，cwd 为 `<profile>/work`。不改 HOME，不接管系统 tmeet，不继承任意 TMEET 环境变量。
- 目录限定在 `<root>/tencent-meeting-cli/profiles/`，拒绝 symlink；最末私有目录权限 0700。共享进程层使用空 `.env` 阻止 dotenv 向上读取项目配置，原始 stdout/stderr 不进入通用日志。
- 授权拒绝已有 config.json、任何加密数据或已有 `.authorization-attempt` 的 profile。取消后该 profile 不再复用；下次由宿主生成新的随机 profile。
- macOS 的凭据密文位于所选 DATA_DIR；master key 使用官方 macOS Keychain 的 `tmeet / master.key` 全局槽。它是共享加密主密钥，不是共享账号 token。宿主不读、不重置、不删除该 Keychain 项。
- Windows 实现使用固定 HKCU 注册表 keychain，不能据 DATA_DIR 宣称隔离。其他平台虽有官方原生包，本批仅对 macOS arm64 交付上述路径与隔离验证，其他平台明确不支持。

## 以会议号指定会议，不向模型导出内部 ID、录制、纪要或参会人

来源：[meeting/get.go](https://github.com/TencentCloud/tencentmeeting-cli/blob/v1.0.15/cmd/meeting/get.go)、[record_enrich.go](https://github.com/TencentCloud/tencentmeeting-cli/blob/v1.0.15/cmd/meeting/record_enrich.go)、[output/print.go](https://github.com/TencentCloud/tencentmeeting-cli/blob/v1.0.15/internal/output/print.go)、[官方查询会议 API](https://cloud.tencent.com/document/product/1095/93432)。

- 资源严格限定为 `tmeet://meeting-code/<6–15 位数字会议号>`，不是网页地址，也不接收平台内部 `meeting_id`。会议号由用户明确提供，宿主不搜索、不猜测，也不把 URL 或任意 CLI 参数当作资源。
- 唯一业务命令：`meeting get --meeting-code <meetingCode> --format json`。业务命令只携带会议号，不把返回的内部 `meeting_id` 用作后续参数。
- 输出 envelope 的 `data.meeting_info_list` 必须恰为一个会议，且返回 `meeting_code` 必须与请求会议号完全一致。仅提取 subject、meeting_code、start_time、end_time、status，限定字段和总体大小。`documentId` 使用会议号；模型文本只显示会议号，不输出内部 `meeting_id`，也不给模型原始 JSON、trace_id、主持人密钥、会议密码、参会者或录制链接。
- 官方 CLI 当前可能自动请求同一会议的录制基础元数据（最多 2×100 条，失败降级）。Space 丢弃该数据，不向模型展示或导出录制、纪要或参会人；因此既不把“未导出”误写成 CLI 完全没有读取，也不据空 records 断言没有录制或概要完整。
- `documentId=meetingCode`、`url=原内部ref`、`revision=0`；0 不表示可做乐观写入。
- 每次读前校验预期身份；进程目录/环境准备完后，在 `beforeSpawn` 内执行宿主 beforeRead 并再次在线比对身份，最后同步 assertRead 紧贴 spawn。业务返回后再 assertRead，避免撤销/切换期间的数据回流。
- 本批无搜索、录制下载、纪要读取、参会人导出、授权申请或任何写入。后续写入仍需独立评审/授权，不以本切片冒充完成。

## 品牌资产与验证

- 官网首页 [meeting.tencent.com](https://meeting.tencent.com/) 的图片元数据引用 [官方 logo128.png](https://cdn.meeting.tencent.com/assets/next-website/logo128.png)。保存为 `resources/brands/tencent-meeting.png`，128×128 RGBA，未加工；SHA256 `40f08c632268086cff8bbbbe6c292b95ccf5effbb1f7dfa9966592ed40df48c9`。仅用于指认腾讯会议，商标权归原权利人。
- 测试为注入进程/安装器的本地合约与隔离检查，不声称线上业务 E2E 已完成。覆盖缺少安装确认、原生文件完整性、私有配置路径、已有凭据拒绝、在线身份失败、账号变更、命令/URL 限定、超时/取消、权限撤销、回包错配及敏感字段不透出。
- 真实账号验收待用户自行发起：确认 macOS arm64；在宿主明确安装确认后打开官方授权；按官方页面授予；校验显示实际账号；仅加入有权读取的 6–15 位会议号；确认模型结果不含内部 `meeting_id`、录制、纪要或参会人；撤销会话开关后不得读取；系统终端已有账号保持不变。不要在仓库/日志/截图中保存 token、授权码或账号密码。
