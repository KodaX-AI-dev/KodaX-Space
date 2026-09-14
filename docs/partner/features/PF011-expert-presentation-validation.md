# PF011 专家展示验收与素材

2026-09-08，Completed / Local，未提交或发布。参考用户提供的 WorkBuddy 截图与现有连接器交互，完成卡片、详情和共享头像系统。

## 成果

- 16枚原创插画头像，12枚映射已有专家；销售、人力、培训、演示4枚作为素材储备，不增加占位卡片。生产JPEG为256px，共358,905字节。
- 两列自适应卡片：头像、名称、类型、说明、三个能力标签，整卡只有一个详情入口。
- 原生dialog详情：使用专家、任务示例、交付成果、输入资料、质量检查、工作方法与连接器需求。设置、提示词、编辑和删除收进展开区。右侧会话详情共享头像和标签。
- 浏览不绑定、不写草稿、不发送消息；明确选择时应用方法开关。Escape关闭恢复焦点；375px无横向溢出，浅深色已检查。

## 素材与生成记录

生成方式：内置 image_gen，逐枚生成16张原创头像。参考用户截图的信息层级与头像形式，没有复制 WorkBuddy 人物素材。

- [头像总览](</Users/samharadelijiang/Documents/kodax Space/audits/expert-card-design-20260908/avatar-gallery.png>)
- [完整16条生成提示及原始输出路径](</Users/samharadelijiang/Documents/kodax Space/audits/expert-card-design-20260908/avatar-prompts.json>)
- 原图保存于本次审计目录的 `avatar-originals/`；生产素材为 `apps/desktop/public/expert-avatars/`。
- 共享映射：`extensions/partner-library/expert-presentation.json`。
- [卡片效果](</Users/samharadelijiang/Documents/kodax Space/audits/expert-card-design-20260908/cards-preview.png>)、[真实Electron详情](</Users/samharadelijiang/Documents/kodax Space/audits/expert-card-design-20260908/electron-expert-profile.png>)。

## 验证

审计目录：`/Users/samharadelijiang/Documents/kodax Space/audits/expert-card-design-20260908/`。

- `final-tests.log`：22通过、0失败、0跳过（15插件浏览器UI、4右栏、3归档测试）。覆盖明确选择、方法开关、编辑副本、删除、Escape与窄屏。
- `baseline-countercheck.log`：新增回归断言在原卡片上检测到4个按钮，证明能发现旧版问题；此为基线反证，不宣称第一次运行即得到红灯。
- `typecheck.log`、`lint.log`、`build.log`、`package.log`：类型、lint、构建与macOS arm64打包通过。归档仍只有manifest和HTML两个文件，约416KB，小于2MB。
- `electron-smoke.log`：12个专家在真实Electron/IPC和隔离用户目录完成卡片、详情、右栏头像解码，明确选择，默认方法开关，刷新恢复，第二会话隔离与移除。业务模型使用mock，仅证明交互与持久化，不作为专业能力质量复测。
- `library-update.json`：本机插件更新成功，12专家、13连接器，保留启用状态；旧插件已备份。新版应用已构建并启动。

本轮没有修改专家manifest行为、方法Skill、连接器或运行权限。保留工作区既有未提交修改；审计材料记录本轮相对基线增量。

2026-09-08 补充：输入框中的 `PartnerExpertChip` 引用标签复用同一头像映射，在名称前显示20px圆形头像；自建或未知专家显示姓名首字。保留独立移除按钮和点击查看详情行为。既有Chip浏览器交互回归、单文件lint与前端构建通过。该补充更新源代码及前端构建产物，尚未重新打包正在运行的桌面应用。
