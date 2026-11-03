# Issue 236 — macOS notifications and attention badges

目标：macOS 与 Windows 均支持既有 F020 完成通知和 F145 待关注会话角标。系统权限、专注模式和用户关闭通知的选择继续生效。SDK、任务权限及通知触发条件不变。

## 验收要求

- macOS Intel/Apple Silicon 安装包使用有效的 ad-hoc 签名；不需要 Developer ID 证书或公证。保留 SDK 校验过的原生资源字节，打包 smoke 继续校验其哈希。Release 在候选归档前执行 `codesign --verify --deep --strict`。
- `notification.show` 只有收到 Electron `show` 事件才确认接收；原生失败、不可用、未确认均返回可辨别结果，不以 `isSupported()` 冒充通知已显示。
- 设置中可以主动测试通知、看到失败或确认结果；测试不会自动开启后台完成通知，不发送会话内容或调用模型。
- 首次原生通知成功后，macOS 重新应用已有的待关注计数；无需等下一次会话事件。角标仍按唯一会话计数，阅读/处理后清除，不新增通知存储。
- 后台完成提醒仍只针对已开始的实时任务，运行至少一分钟且完成时应用不在前台；历史重放、取消任务和前台完成不新增系统提醒。
- 点击原生通知恢复/显示窗口并切到对应会话。Windows/Linux 原路径保持可用。

## 自动验证

`scripts/test/mac-notification-package.test.mjs`、`electron/ipc/notification.test.ts`、既有 badge/completion 单元，以及 `tests/e2e/native-notifications.spec.ts`。E2E 保留真实 UI/IPC/Main，仅替换原生通知的成功/失败回调；不将它当作已证明用户实际看见系统横幅。四平台发布验收包含该 E2E，两个 macOS 打包 job 验证真实应用签名。

## Mac 客户真机验证

1. 从 alpha.4 DMG 安装到 Applications，首次按系统提示打开。ad-hoc 签名不提供 Apple 发布者信任或公证。
2. 打开设置 → 测试通知，在 macOS 请求时允许通知。在“系统设置 → 通知 → KodaX Space”中确认横幅、声音和应用角标；检查专注模式。
3. 完成一条后台长任务，确认通知；点击返回会话。验证未读/审批等待的 Dock 计数以及阅读/处理后的清除。
4. 系统拒绝通知或开启专注模式时，Space 不报告必然出现横幅；应用内提示仍可见。前台短任务不弹完成通知。

平台代码与自动化验收可以在 CI 证明；系统授权后的真实横幅、声音及用户个人通知配置仍需真机人工确认。
