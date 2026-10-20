# 待机完整帧动画 · 预览

> 本待机素材保持不变。完整预览现已按此标准扩展[思考、工作、等待确认和完成](../companion-dog-v7/README.md)；下文保留待机精修记录。

2026-10-17。只精修待机，沿用已选小狗造型；正式产品宠物、已有动作和功能未替换或取消。

## 素材与播放方式

- 底稿：[原造型](../companion-dog-v3/character-anchor.png)，原文件为1254×1254。
- 眼睑原画：[半闭眼](blink-half.png)、[闭眼](blink-closed.png)。均由内置 imagegen 基于原图编辑，只取眼睛附近的小区域，身体始终使用同一张底稿。[完整提示词](prompts.json)。生成原文件保留于 Codex generated_images，以上是项目副本。
- 尾巴保持原图纹理，离线按横向柔弯绘制，变化在尾根前衰减至零；不改变躯干、四肢、头部或项圈。没有骨骼、关节、身体部件旋转或运行时姿态插值。
- [完整帧图集](idle-atlas.png)包含83张独立像素快照。网页仅裁切完整透明位图，不再组装身体。底稿和两张眼睑原画是美术源，83张为离线合成帧，并非83张重新绘制的原画。
- [播放帧表](frames.json)以24fps播放192步，共8秒。静止段复用同一中性帧，不倒放；首尾都留中性停顿。
- 两小段摇尾与两次短眨眼之间保留安静间隔。本轮没有加入转头、呼吸、行走等其他动作。

## 实际播放复审

自审发现并修复过两类合成问题：底稿实际尺寸与1280坐标不一致，导致最初的尾巴扫描行错位；共享画布复用导致打包后中性帧误用半闭眼。两者都已修复，以下证据来自修复后的版本。`artifacts/companion-idle-v6/playback-dark/`为修复前的失败记录，不作为完成证据。

- 深色完整工作区原速录取24.4秒，305张截图，覆盖三个完整循环；[截图时间与实际播放相位](../../../../artifacts/companion-idle-v6/reviewed-dark/times.json)。页面始终为visible，时钟确实跨过三个循环。
- [原速播放观察图](../../../../artifacts/companion-idle-v6/reviewed-playback-contact.png)：头身、花色、项圈和脚底稳定，尾根没有分离；循环处保持同一坐姿。
- 浅色完整工作区0.5倍速录取16.4秒，132张截图，覆盖一个完整循环；[半速观察图](../../../../artifacts/companion-idle-v6/reviewed-light-contact.png)。检查了尾巴透明边缘、动作收束、眨眼前后。
- [闭眼实际画面](../../../../artifacts/companion-idle-v6/blink-in-workspace.png)：逐帧定位闭眼状态，没有残留瞳孔、双重轮廓或眼窝贴片边缘。
- 工作区停靠尺寸与120px观察尺寸同时播放相同帧；暂停、重播、逐帧和速度切换已操作。
- 减少动画开启后，绘制计数在两次相隔实际操作的读取中均为986，没有持续重绘。恢复后可继续播放。
- 浏览器warning/error为空。

## 一致性与性能核对

5项检查通过：闭环中性姿态、打包后192步逐一对照合成像素、短眨眼与摇尾确实存在、全部192步的变化仅发生在眼睛和尾巴区域、播放时钟跨循环并保持暂停与静止帧不重绘。

图集为2048×2816，RGBA解码约22MiB，PNG约0.55MB；眼睑原画和离线合成脚本不在网页运行时加载。静止段、暂停、后台与减少动画不重复绘制相同位图。未安装新依赖。

重新生成与核对：

```powershell
node docs/design/assets/companion-dog-v6/build-idle.mjs
node --test docs/design/assets/companion-dog-v6/build-idle.test.mjs docs/design/space-ui-exploration/companion-frames.test.mjs
```

当前入口仍是`space-ui-exploration/companion-workspace.html`，默认播放待机；保留静态原造型对照。其余动作和整体任务流程继续明确显示待补帧。
