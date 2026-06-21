/**
 * 雷达图组件 — 封装 Chart.js + 脉冲动画
 */
const RadarChart = {
  /** @type {Chart|null} */
  instance: null,
  /** @type {number|null} */
  _pulseRaf: null,

  /** 维度中文→英文标签映射 */
  DIM_LABELS: {
    '团战决策': 'Teamfight',
    '线上压制': 'Laning',
    '长线运营': 'Macro',
    '操作上限': 'Mechanics',
    '心态稳定': 'Consistency',
    '版本适应': 'Adaptation',
  },

  /**
   * 初始化 Chart.js 雷达图
   * @param {string} canvasId  主画布 ID
   * @param {string} fxCanvasId  特效层画布 ID
   * @returns {RadarChart}
   */
  init(canvasId, fxCanvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return this;

    const css = getComputedStyle(document.documentElement);
    const blue = css.getPropertyValue('--blue').trim() || '#6366f1';
    const blueFill = css.getPropertyValue('--blue-fill').trim() || 'rgba(99,102,241,0.18)';
    const orange = css.getPropertyValue('--orange').trim() || '#f59e0b';
    const orangeFill = css.getPropertyValue('--orange-fill').trim() || 'rgba(245,158,11,0.14)';
    const fontSans = css.getPropertyValue('--font-sans').trim() || 'system-ui';

    this.instance = new Chart(canvas, {
      type: 'radar',
      data: {
        labels: [],
        datasets: [
          {
            label: '选手',
            data: [],
            borderColor: blue,
            backgroundColor: blueFill,
            borderWidth: 2.5,
            pointRadius: 4,
            pointBackgroundColor: blue,
            pointBorderColor: 'rgba(255,255,255,0.8)',
            pointBorderWidth: 1.5,
            pointHoverRadius: 6,
          },
          {
            label: '同位置均值',
            data: [],
            borderColor: orange,
            backgroundColor: orangeFill,
            borderWidth: 2,
            borderDash: [6, 4],
            pointRadius: 3,
            pointBackgroundColor: orange,
            pointBorderColor: 'rgba(255,255,255,0.6)',
            pointBorderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 700,
          easing: 'easeInOutCubic',
        },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false },
        },
        layout: {
          padding: { top: 40, bottom: 40, left: 30, right: 30 },
        },
        scales: {
          r: {
            min: 0,
            max: 100,
            ticks: { display: false, stepSize: 20 },
            grid: {
              circular: false,
              color: 'rgba(148,163,184,0.08)',
              lineWidth: 1,
            },
            angleLines: {
              color: 'rgba(148,163,184,0.08)',
              lineWidth: 1,
            },
            pointLabels: { display: false },
          },
        },
      },
      plugins: [this._axisLabelPlugin(fontSans)],
    });

    this._startPulse(fxCanvasId);
    return this;
  },

  /**
   * 更新雷达图数据
   * @param {Array} dimensions  维度数组 [{label, value, avg}, ...]
   * @param {'player'|'team'} type
   */
  update(dimensions, type = 'player') {
    if (!this.instance) return;

    const labels = dimensions.map(d => this.DIM_LABELS[d.label] || d.label);
    const selfValues = dimensions.map(d => d.value);
    const avgValues = dimensions.map(d => d.avg);

    this.instance.data.labels = labels;
    this.instance.data.datasets[0].data = selfValues;
    this.instance.data.datasets[0].label = type === 'player' ? '该选手' : '该队伍';
    this.instance.data.datasets[1].data = avgValues;
    this.instance.data.datasets[1].label = type === 'player' ? '同位置均值' : '联赛均值';

    // 动态重读 CSS 变量（主题切换后颜色可能变化）
    const css = getComputedStyle(document.documentElement);
    const blue = css.getPropertyValue('--blue').trim() || '#6366f1';
    const blueFill = css.getPropertyValue('--blue-fill').trim();
    const orange = css.getPropertyValue('--orange').trim() || '#f59e0b';
    const orangeFill = css.getPropertyValue('--orange-fill').trim();

    this.instance.data.datasets[0].borderColor = blue;
    this.instance.data.datasets[0].backgroundColor = blueFill;
    this.instance.data.datasets[0].pointBackgroundColor = blue;
    this.instance.data.datasets[1].borderColor = orange;
    this.instance.data.datasets[1].backgroundColor = orangeFill;
    this.instance.data.datasets[1].pointBackgroundColor = orange;

    // 更新网格线颜色
    const gridColor = css.getPropertyValue('--line').trim() || 'rgba(148,163,184,0.08)';
    this.instance.options.scales.r.grid.color = gridColor;
    this.instance.options.scales.r.angleLines.color = gridColor;

    this.instance.update();
  },

  /**
   * 自定义轴标签插件 — 在雷达图外侧渲染维度名称 + 分值
   * @param {string} fontFamily
   * @returns {Object} Chart.js plugin
   */
  _axisLabelPlugin(fontFamily) {
    return {
      id: 'radarAxisLabels',
      afterDraw(chart) {
        const r = chart.scales.r;
        if (!r) return;

        const ctx = chart.ctx;
        const selfData = chart.data.datasets[0].data;
        const avgData = chart.data.datasets[1].data;
        const labels = chart.data.labels;

        const css = getComputedStyle(document.documentElement);
        const inkColor = css.getPropertyValue('--ink').trim() || '#f1f5f9';
        const blueColor = css.getPropertyValue('--blue').trim() || '#6366f1';
        const mutedColor = css.getPropertyValue('--muted').trim() || '#64748b';
        const orangeColor = css.getPropertyValue('--orange').trim() || '#f59e0b';

        for (let i = 0; i < labels.length; i++) {
          const ang = r.getIndexAngle(i) - Math.PI / 2;
          const dist = r.drawingArea + 26;
          const x = r.xCenter + Math.cos(ang) * dist;
          const y = r.yCenter + Math.sin(ang) * dist;

          // 维度标签
          ctx.save();
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = `600 12px ${fontFamily}`;
          ctx.fillStyle = inkColor;
          ctx.fillText(labels[i], x, y - 5);

          // 双色数值（蓝/橙）
          ctx.font = `600 11px ${fontFamily}`;
          const selfVal = selfData[i] ?? '—';
          const avgVal = avgData[i] ?? '—';

          ctx.fillStyle = blueColor;
          ctx.fillText(selfVal, x - 16, y + 10);
          ctx.fillStyle = mutedColor;
          ctx.fillText('/', x, y + 10);
          ctx.fillStyle = orangeColor;
          ctx.fillText(avgVal, x + 16, y + 10);
          ctx.restore();
        }
      },
    };
  },

  /**
   * 高分维度脉冲动画（≥90 分的数据点呼吸发光）
   * @param {string} fxCanvasId
   */
  _startPulse(fxCanvasId) {
    const fx = document.getElementById(fxCanvasId);
    if (!fx) return;

    const fxCtx = fx.getContext('2d');
    const self = this;

    const PULSE_PERIOD = 1400;

    function animate() {
      self._pulseRaf = requestAnimationFrame(animate);
      if (!self.instance) return;

      const main = self.instance.canvas;
      const w = main.clientWidth;
      const h = main.clientHeight;
      const dpr = window.devicePixelRatio || 1;

      fx.width = Math.round(w * dpr);
      fx.height = Math.round(h * dpr);
      fx.style.width = w + 'px';
      fx.style.height = h + 'px';
      fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      fxCtx.clearRect(0, 0, w, h);

      const meta = self.instance.getDatasetMeta(0);
      if (!meta?.data?.length) return;

      const t = (performance.now() % PULSE_PERIOD) / PULSE_PERIOD;
      const phase = Math.sin(t * Math.PI * 2) * 0.5 + 0.5;
      const css = getComputedStyle(document.documentElement);
      const blue = css.getPropertyValue('--blue').trim() || '#6366f1';

      for (let i = 0; i < meta.data.length; i++) {
        const value = self.instance.data.datasets[0].data[i];
        if (value < 88) continue;

        const pt = meta.data[i];
        if (!pt || pt.x == null) continue;

        // 外圈脉冲环
        const ringR = 6 + phase * 10;
        fxCtx.beginPath();
        fxCtx.arc(pt.x, pt.y, ringR, 0, Math.PI * 2);
        fxCtx.fillStyle = `rgba(99,102,241,${((1 - phase) * 0.4).toFixed(3)})`;
        fxCtx.fill();

        // 核心高光点
        fxCtx.beginPath();
        fxCtx.arc(pt.x, pt.y, 4 + phase * 1.5, 0, Math.PI * 2);
        fxCtx.fillStyle = blue;
        fxCtx.fill();
        fxCtx.lineWidth = 1.5;
        fxCtx.strokeStyle = 'rgba(255,255,255,0.8)';
        fxCtx.stroke();
      }
    }

    animate();
  },

  /** 销毁实例和动画 */
  destroy() {
    if (this._pulseRaf) cancelAnimationFrame(this._pulseRaf);
    if (this.instance) this.instance.destroy();
    this.instance = null;
    this._pulseRaf = null;
  },
};
