# 工作动作 v10 · 关键姿态与离线补帧试片

仅修改完整工作区预览。正式产品宠物未替换；本版待机及其余任务状态继续引用此前素材。用户反馈「这个好多了」后，五种状态的后续候选见 [v11](../companion-dog-v11/README.md)。

[打开 v10 完整工作区](http://127.0.0.1:4181/space-ui-exploration/companion-workspace.html?theme=dark&state=working&animation=v10) · [对比被否定的 v9](http://127.0.0.1:4181/space-ui-exploration/companion-workspace.html?theme=dark&state=working&animation=previous)

## 改变制作方法

用户再次明确指出 v9 播放颤抖、体验不佳。v9 的 `bridge()` 仍是在独立绘制的画面之间插入另外绘制的画面，并非从固定端点计算补帧。配准、增加原画数量和末帧检查没有解决形体漂移。

本版停止继续生成整批中间原画，从现有完整角色原画中挑选 **25 个关键姿态**，剔除搬运末尾一张比例不一致的姿态，并保留入场、撑起后腿的过渡姿态。姿态、来源编号和顺序见 [keyposes.json](keyposes.json)，输入 PNG 保存在 `keyframes/`。

使用 [RIFE ncnn Vulkan 官方工具](https://github.com/nihui/rife-ncnn-vulkan)的 `20221029` 发布包、`rife-v4.6` 模型和时间对称推理，离线计算端点之间的画面。没有实时骨骼、身体贴片或两张完整姿态直接淡化。RIFE 是估计中间运动的模型，也可能在遮挡处产生柔化，不能把补帧等同于正确的角色结构。

Windows 发布包的图片输入需写成 RGB PNG；最初输入 RGBA PNG 的短探针出现明显异常，CPU 与两张显卡均复现，改 RGB 后恢复。透明素材分别在黑、白底上推理，再离线恢复 alpha。关键端点也走相同采样流程，避免关键画面与中间画面交替出现明显锐度差异。相同关键姿态之间直接复用画面。

最终播放 **24fps、265 个播放步、200 张完整位图画面，约 11.04 秒一轮**，包含约两秒休息。它们由关键姿态补帧得到，并非 200 张独立重画的原画。起身、叼取、搬运、趴下检查、抬头回应、坐回的过程保留。循环休息段与下一轮共用同一中性画面。

## 实际播放复核

先录取七关键姿态的 2.33 秒短段，再接入完整动作。完整工作区内最终版本录取与复看：

- 深色原速 11.7 秒，350 张实际页面截图，跨过循环：[时间记录](../../../../artifacts/companion-working-v10/final-normal/times.json)、[观察图](../../../../artifacts/companion-working-v10/final-normal-contact-0.jpg)。
- 浅色半速 22.8 秒，690 张实际页面截图，跨过循环：[时间记录](../../../../artifacts/companion-working-v10/final-slow-light/times.json)、[准备与叼取](../../../../artifacts/companion-working-v10/final-slow-light-contact-0.jpg)、[搬运与检查](../../../../artifacts/companion-working-v10/final-slow-light-contact-1.jpg)、[坐回与循环](../../../../artifacts/companion-working-v10/final-slow-light-contact-2.jpg)。截图数不是原画数量；页面时间标签按约 250ms 节流，不能当作每次绘制的精确时间。
- 暂停前后绘制数均 2301，减少动画前后均 2302，间隔 1.2 秒：[实际记录](../../../../artifacts/companion-working-v10/performance-check.json)。
- 工作中请求等待确认，先收束至中性姿态，再进入等待，没有自动批准：[实际状态记录](../../../../artifacts/companion-working-v10/exit-playing/state-check.json)。

复看：连续重绘导致的快速轮廓跳变减轻，大动作有计算出的中间过程。叼取时的嘴部、前爪遮挡处仍有少量柔化；跨批原画的形体差异并不会被插值自动修正。当前是供用户评审补帧方向的候选，尚未作为正式产品动画验收。

新增相邻画面突变检查在 v9 上失败，在本版通过；测量按播放器的实际目标坐标还原整幅画面，覆盖循环接缝。v9 最大相邻像素变化约 27.38，本版约 6.95，具体见[报告](../../../../artifacts/companion-working-v10/continuity-report.json)。两版帧率不同，这个数值只用于防止明显跳帧，不能证明角色一致性、自然度或审美合格。含播放机制的 14 项检查通过：[结果](../../../../artifacts/companion-working-v10/test-results.txt)。

## 性能与重建

浏览器仍只加载清单和精灵图、按时间裁切完整位图，不加载推理模型。透明留白离线裁切后保留舞台原坐标，按高度排布图格，重复停顿共用图格。当前工作图集 **1024×1520、1,104,996 字节、RGBA 像素估算 5.94MiB**，见[资产报告](../../../../artifacts/companion-working-v10/asset-report.json)。

原版两张精灵图像素合计约 4.43MiB、原画播放约 4–6fps。本版仍是轻量图片播放方式，但运动段 24fps，图集也稍大，不能承诺 CPU 和内存消耗与原版完全相同。暂停、后台、减少动画停表，连续相同画面合并计时，解码缓存回收由浏览器决定。页面单帧绘制提交时间不代表总 CPU/GPU 占用。

制作工具与中间推理文件在忽略目录 `artifacts/companion-working-v10/`，不会由预览播放器请求。重建前将官方 Windows 发布包解压到 `artifacts/companion-working-v10/tools/rife-ncnn-vulkan-20221029-windows/`。工具来源、校验和与保留的关键姿态见 [asset-origins.json](asset-origins.json)。本轮未新增独立生成原画。

```powershell
node docs/design/assets/companion-dog-v10/build-working.mjs
node --test docs/design/assets/companion-dog-v10/continuity.test.mjs docs/design/space-ui-exploration/companion-frames-states.test.mjs docs/design/space-ui-exploration/companion-frames.test.mjs
```
