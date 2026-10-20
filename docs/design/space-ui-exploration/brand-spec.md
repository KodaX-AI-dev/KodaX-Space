# 工作区与任务伴侣预览资产

2026-10-17。本次迭代使用本仓库的实际资产与已选视觉方向。

- 工作区来源：`integrated.html` 与 `integrated.css`，保留三项目、会话、成果、审阅、草稿和原详情交互。
- 品牌、图标、字体：沿用该 HTML 已内嵌的 KodaX logo、Lucide 图标与 Geist 字体；没有新建占位品牌资产。
- 暖石墨画布 `#181817`、暖纸白 `#fcfbf8`、琥珀 `#e2b66d` 与绿色 `#a3bc97` 来自现有预览 tokens。
- 角色锚点：`../assets/companion-dog-v3/character-anchor.png`，保持暖杏色、奶油色区块、垂耳、绿项圈和小铜牌。
- v4 角色素材：`../assets/companion-dog-v4/rig-atlas.png`、`torso.png` 与 `collar.png`，使用内置 imagegen 生成可动画的完整部件，提示词位于同目录。原始生成文件保留，项目使用本地副本。
- v4 骨骼版已被用户否定，主入口停止使用。相关部件与旧模块只作失败记录保留。
- 当前角色渲染：`companion-frames.js`只绘制完整角色位图帧，默认保留v6待机；v7扩展思考、工作、等待确认和完成，带进入、保持与收束。网页不组装或变形身体。保留静态原造型对照，其余规划动作待补帧。素材、提示词与实际播放复审见`../assets/companion-dog-v7/README.md`；未接入生产代码。
