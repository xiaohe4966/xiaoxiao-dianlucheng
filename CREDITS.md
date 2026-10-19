# 素材来源与版权说明

「小小电路城」的界面、交互和电路仿真代码由我们自己编写；
**元件外观图形来自开源项目 Velxio**，按下文许可使用。

## 元件图形

- 来源：[Velxio](https://github.com/davidmonterocrespo24/velxio)
  （作者 David Montero Crespo，许可证 **AGPL-3.0**）
  - `assets/components/led-red.svg`、`led-green.svg`、`led-blue.svg`、`led-yellow.svg`（LED，取自 Velxio 的 `component-svgs/led*.svg`）
  - `assets/components/led-white.svg`（由上面的红色版改色得到：`fill="red"` → `#f1f5f9`，`#ff8080` → `#ffffff`）
  - `assets/components/resistor.svg`（电阻）
  - `assets/components/breadboard.svg`（面包板）
- 面包板的原始素材来自 [Fritzing parts library](https://github.com/fritzing/fritzing-parts)，
  按 **CC-BY-SA 3.0** 许可使用：<https://creativecommons.org/licenses/by-sa/3.0/>
  （Velxio 自己的 `frontend/public/component-svgs/fritzing/ATTRIBUTION.md` 也是这么标注的。）
- 电池、二极管、电机、喇叭、灯泡、开关的图形参考 Velxio 的元件画法与配色，由本项目重绘/改写。

我们对图形做过的修改：

- 把图形按我们的零件尺寸缩放，并把端子引线接到我们的接线点（LED 加了两条拐弯引脚）；
- LED 拆成 5 种颜色文件，并新增白色版；
- 面包板用整块板子的 SVG，把 4 个接线点放在 + / − 电源轨的两端；
- 其余零件按同样的"真实元件"风格重画。

## 本项目许可证

因为使用了 AGPL-3.0 的元件图形，**本项目整体按 [AGPL-3.0](LICENSE) 发布**（`LICENSE` 为标准 AGPL-3.0 全文）。

- 自己在家玩、自己改、给孩子玩：完全没问题。
- 如果要把这个网站放到网上给别人用，或分发修改版：需要按 AGPL-3.0 公开本项目源码，
  并保留上面的版权声明（包括 Fritzing 的 CC-BY-SA 署名）。
- 不想开源的话，需要向 Velxio 作者购买商业授权：
  <https://github.com/davidmonterocrespo24/velxio/blob/master/COMMERCIAL_LICENSE.md>
  （Velxio 仓库里的 LICENSE 附带了商业授权说明，原件留档在
  [`assets/components/LICENSE-velxio.txt`](assets/components/LICENSE-velxio.txt)）
