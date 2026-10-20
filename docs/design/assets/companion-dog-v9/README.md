# 工作动作 v9 · 连续性修订预览

> **用户复看仍认为颤抖明显、体验不佳，本版未通过。** 下文保留此前制作和验证记录，不能作为观感合格证据。当前试片改用 [v10 关键姿态与离线补帧](../companion-dog-v10/README.md)。要看本版请用[上一版对照入口](http://127.0.0.1:4181/space-ui-exploration/companion-workspace.html?theme=dark&state=working&animation=previous)。

仅供完整工作区预览，不替换正式产品宠物。v6 待机保留，其他状态仍使用 v7 / v8 预览资产。v8 原画、失败证据和诊断保留。

[打开完整工作区](http://127.0.0.1:4181/space-ui-exploration/companion-workspace.html?theme=dark&state=working)。顶部原速 / 0.5×慢放，右侧逐帧、显示尺寸、减少动画可用。

## 本轮改动

- 入场和起身的地面卷轴分离后固定位置，角色按角色边界和脚底配准，修正此前地面道具改变边界导致的整体横移。叼起后的卷轴仍随完整原画变化。道具分离后保留原始道具区域的透明像素，避免纸卷被分割成碎片。
- 起身、站立至趴下、低头检查、抬眼回应、坐回重新选绘。针对低头、撑起后肢、叼住卷轴抬头、检查至回应、趴姿撑起、坐姿收尾另补六段短过渡，保留原端点，只取中间绘图。
- 回应保持趴姿，不再从低趴直接跳到挺胸的另一套姿态。坐回后复用 v6 待机的尾巴柔弯制片代码，离线烘焙十二张完整收尾帧，再进入相同中性帧的休息段。
- 每段保留坐、站、短走、趴、坐回的完整身体变化；检查有短暂观察停顿，休息约两秒。工作动作约9.17秒一轮，18fps，含停顿。图集118格，不等于118张新增原画：包含保留原画、中性帧、离线尾巴收尾；连续静帧共用图格。

运行时只裁切完整位图。没有实时身体骨骼、光流补间、身体部件旋转或双姿态淡化。离线光流试片因重影已弃用，位于 artifacts 中，不参与构建或播放。

## 验证与实际播放

在内置浏览器的完整工作区录取：深色原速10秒（298张实际页面截图），浅色半速19.5秒（573张实际页面截图），均跨过整轮和循环连接。截图数不是原画数；DOM诊断通常250ms更新一次，也不能拿其时间标签当逐帧时间戳。

- [原速实际截图](../../../../artifacts/companion-working-v9/final-normal/times.json)、[原速观察图](../../../../artifacts/companion-working-v9/final-normal-contact.jpg)。
- [半速实际截图](../../../../artifacts/companion-working-v9/final-slow-light/times.json)、[起身、叼取、搬运、趴下](../../../../artifacts/companion-working-v9/slow-segment-0.jpg)、[检查、回应、坐回](../../../../artifacts/companion-working-v9/slow-segment-1.jpg)、[尾巴收尾与休息](../../../../artifacts/companion-working-v9/slow-segment-2.jpg)。
- 同一回归检查对 v8 报告入场角色横移约9.4px、最后收束帧与中性帧差异14.30；v9入场通过2px范围检查，最后尾巴收尾帧与中性帧匹配。测试只证明具体回归，不作为审美评分。
- 暂停两次绘制计数均2595；减少动画两次均2599，间隔1.2秒。[实际记录](../../../../artifacts/companion-working-v9/performance-check.json)。
- 实际在工作叼取阶段切换等待，继续播放后经过收束进入 waiting，6.5秒录取结束时保持等待，未自动确认。[切换证据](../../../../artifacts/companion-working-v9/transition-playing-check.json)。逐帧查看会暂停播放；暂停时切换状态仍保持暂停，需点「继续播放」推进收束，首次暂停切换记录也保留。
- 包含旧资产与播放器的23项检查通过。[结果](../../../../artifacts/companion-working-v9/test-results.txt)。

复看结论：开头整体横移、直接换成高趴姿、循环最后突然换回中性姿态的问题已针对性修订。跨批原画仍能看出脸部线条、耳形和下趴节奏的轻微差异；这仍是待用户比较的预览，不作为正式产品动画验收。

工作中途切其他状态会先沿完整动作收束；最早段的退出路径最长约5.2秒，右侧和停靠位显示收束目标。没有跳过动作或自动批准任务。

## 性能与重建

工作图格104×104，图集832×1560，RGBA像素估算约4.95MiB；实际文件体积见[资产报告](../../../../artifacts/companion-working-v9/asset-report.json)。原版两张96px图格精灵图合计约4.43MiB像素，工作源帧率约4–6fps；本预览18fps，不能承诺CPU占用完全相同。当前图集按需解码，状态切换仅保留当前与待加载目标引用，暂停、减少动画及后台停表，相同静帧合并计时。浏览器决定解码缓存何时回收；像素估算不是浏览器总内存测量。

内置 image_gen 生成及修改原画。完整提示词和输入角色见 [prompts.json](prompts.json)、[gap-prompts.json](gap-prompts.json)、[seam-prompts.json](seam-prompts.json)、[asset-origins.json](asset-origins.json)。原图保存在 generated_images，并复制至本目录；运行只请求打包后的图集。

```powershell
node docs/design/assets/companion-dog-v9/build-working.mjs
node --test docs/design/assets/companion-dog-v9/build-working.test.mjs docs/design/space-ui-exploration/companion-frames-states.test.mjs docs/design/space-ui-exploration/companion-frames.test.mjs
```
