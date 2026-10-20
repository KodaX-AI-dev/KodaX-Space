# 五种状态 v11 · 关键姿态与离线补帧预览

沿用用户认可的 v10 工作动画方向。本轮只修改 `docs/design/` 的完整工作区预览，正式产品组件、旧宠物资源与功能均未替换。当前是待用户评审的候选。

[完整工作区](http://127.0.0.1:4181/space-ui-exploration/companion-workspace.html?theme=dark&state=idle) · [v10 工作动作对照](http://127.0.0.1:4181/space-ui-exploration/companion-workspace.html?theme=dark&state=working&animation=v10)

点击「播放流程」依次观察待机、思考、工作、等待确认。流程停在等待，需要主动点击「示例确认，看看完成动作」才进入完成。也可分别选择状态、从头重播、半速观察。直接打开 `state=complete` 会显示完成后的收束画面，重播才播放庆祝。

## 动作与制作

所有状态使用统一的透明 256×256 舞台与中性坐姿，离线缩采样到 112px 素材，裁切后保留完整舞台坐标。运行时播放整只角色的位图，没有实时骨骼或身体分件变形。状态退出先沿已有画面收束，再进入下一状态。

| 状态 | 动作过程 | 关键姿态 | 独立位图 | 时长 | 图集 / 解码像素估算 |
| --- | --- | ---: | ---: | ---: | --- |
| 待机 | 短摇尾由小到大再收住，两次眨眼，动作间留白 | 7 | 34 | 8.04s 循环 | 139KB / 1.07MiB |
| 思考 | 抬眼、向两侧歪头观察、慢眨眼后回正 | 5 | 50 | 7.29s 循环 | 258KB / 1.40MiB |
| 工作 | 起身叼取任务卷、搬运、趴下检查、回应、坐回 | 25 | 200 | 11.04s 循环 | 1,058KB / 5.85MiB |
| 等待确认 | 抬爪一次，轻偏头、眨眼；退出先放下爪 | 6 | 41 | 6.79s，首段只播放一次 | 204KB / 1.38MiB |
| 完成 | 开心起身、向前一步、邀玩俯身、抬身坐回 | 13 | 160 | 8.21s 一次后停住 | 715KB / 4.66MiB |

关键姿态数按独立输入图统计，位图数包含补帧与退出画面；重复停顿共用图格，播放步数不等于原画数量。待机沿用已认可的 v6 造型、尾部与眼睛素材；工作保留 v10 的 25 个关键姿态，增加离线空间对称推理，去掉中间一次降采样，改善嘴部和前爪边缘。试加四张旧工作原画反而增加形体漂移，最终没有采用。

思考、等待、完成的新关键姿态使用内置 imagegen，以 v3 角色锚点与关键姿态为参考；透明区域按完整角色连通域提取，整帧配准。完成动作额外增加四个抬身、站稳、折后腿与坐下姿态，避免俯身直接变坐姿。生成原文件保留，项目使用副本。来源、校验和见 [asset-origins.json](asset-origins.json)，提示词见 [prompts.json](prompts.json) 与 [rise-prompt.json](rise-prompt.json)。

离线补帧使用 RIFE ncnn Vulkan `20221029`、`rife-v4.6` 与时间对称推理，运动段 24fps。常规状态在黑白底推理后恢复透明；完成大动作的双底推理出现前后景运动估计不一致、身体局部变透明，实际慢速复核发现后已撤下。完成改用同一绿底的单次运动推理，再离线抠色、去边缘染色，使整只身体共享同一运动场。工作有绿色任务卷，继续保留黑白双底方式。工具与推理中间文件不进入浏览器。

## 实际播放复核

在完整工作区实际播放，分别录取深色原速与浅色半速，复看整段和关键接缝；下表均为实际页面截图记录，不是离线伪造播放器。

| 状态 | 原速记录 | 半速记录 |
| --- | --- | --- |
| 待机 | `normal-idle`，8.7s / 261 张 | `slow-idle`，16.8s / 505 张 |
| 思考 | `normal-thinking`，8.0s / 240 张 | `slow-thinking`，15.4s / 463 张 |
| 工作 | `normal-working`，11.7s / 349 张 | `slow-working`，22.8s / 683 张 |
| 等待确认 | `normal-waiting`，13.5s / 405 张 | `slow-waiting`，14.5s / 436 张 |
| 完成（修正后） | `final-normal-complete`，9s / 270 张 | `final-slow-complete`，17.5s / 525 张 |

记录位于 `artifacts/companion-states-v11/`，各目录包含截图、`times.json` 和 `capture.json`。观察图同目录以 `-contact.jpg` 结尾。`normal-complete`、`slow-complete` 是已撤下的双底推理失败记录，不能作为最终版本证明。截图数不是动画实际绘制次数；页面时间标签约 250ms 节流，在停顿段可能不变化。

另录取 `waiting-to-complete`：先放下前爪，再庆祝、坐回、停住；`full-flow`：26s，最终停在等待且确认入口可见，没有自动确认。原速、半速与完整姿态复核后，未观察到此前的快速轮廓颤抖和完成身体变透明问题。工作叼取时仍有少量嘴部、前爪边缘柔化，插值不能自动保证所有解剖关系正确。

16 项资产与播放器检查通过，见 [测试结果](../../../../artifacts/companion-states-v11/test-results.txt)。新增检查覆盖：完成动作身体姿态变化、暖色皮毛透明度、共用中性姿态及退出路径、相邻画面突变、等待保持段与完成停播、图集边界和大小。完成丰富度检查在旧 v10 资产上失败，透明度检查在已撤下的双底版本上失败。数值检查只防回归，不代表审美验收。

## 性能与重建

五个图集压缩合计约 2.38MB，按状态延迟加载，单张解码 RGBA 像素估算均低于 6MiB；当前与待切换状态之外不主动保留图片引用，浏览器缓存回收仍由浏览器决定。连续相同画面合并计时，不用 60fps 循环空绘。待机平均约 4.2 次不同画面/秒，运动段上限 24fps。

实际间隔 1.2s 的检查中：完成收束前后绘制数均 658，暂停均 672，减少动画均 673，见 [记录](../../../../artifacts/companion-states-v11/performance-check.json)。后台停表保留原播放器机制并由已有测试覆盖；本轮没有重新测量后台 CPU。单帧画布提交耗时不代表总 CPU/GPU 占用。

原版两张图集像素约 4.43MiB、约 4–6fps；本版仍是轻量图片播放，但不能承诺与原版完全相同的 CPU 或内存消耗。RIFE、生成工具和源画板均不参与运行时播放。

重建需先准备 [官方 20221029 Windows 发布包](https://github.com/nihui/rife-ncnn-vulkan/releases/tag/20221029)，解压到 `artifacts/companion-working-v10/tools/rife-ncnn-vulkan-20221029-windows/`，并使用仓库现有 Node 依赖。

```powershell
node docs/design/assets/companion-dog-v11/prepare-keyposes.mjs
node docs/design/assets/companion-dog-v11/build-states.mjs
node --test docs/design/assets/companion-dog-v11/animation.test.mjs docs/design/space-ui-exploration/companion-frames-states.test.mjs docs/design/space-ui-exploration/companion-frames.test.mjs
```

已有全量清单时，可给构建脚本传状态名只重建该状态，例如 `build-states.mjs complete`。默认预览为 v11，`animation=v10` 保留用户认可的工作动作基线，`animation=previous` 保留被否定的 v9 比较记录。
