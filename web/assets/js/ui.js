/**
 * UI 渲染层 — 纯 DOM 操作，无副作用
 * 所有方法都是无状态的渲染函数
 */
const UI = {
  /** 维度中英文映射 */
  DIM_EN: {
    '团战决策': 'Teamfight',
    '线上压制': 'Laning',
    '长线运营': 'Macro',
    '操作上限': 'Mechanics',
    '心态稳定': 'Consistency',
    '版本适应': 'Adaptation',
  },

  /**
   * 渲染赛季下拉框
   * @param {Array} seasons
   * @param {string} selectedId
   */
  renderSeasons(seasons, selectedId) {
    const sel = document.getElementById('sel-season');
    if (!sel) return;
    sel.innerHTML = seasons.map(s =>
      `<option value="${s.id}" ${s.id === selectedId ? 'selected' : ''}>${s.id}</option>`
    ).join('');
    this.updateCustomSelect('sel-season');
  },

  /**
   * 渲染实体下拉框（选手/队伍列表）
   * @param {Array} entities
   * @param {string} selectedId
   * @param {'player'|'team'} type
   */
  renderEntities(entities, selectedId, type = 'player') {
    const sel = document.getElementById('sel-entity');
    if (!sel) return;
    sel.innerHTML = entities.map(e => {
      const name = e.name || e.current_handle || '—';
      const rank = e.rank_position || e.r_position || '';
      const pos = e.position || '';
      const label = type === 'player'
        ? `${name} · ${pos}${rank ? ' · #' + rank : ''}`
        : `${name}${rank ? ' · #' + rank : ''}`;
      return `<option value="${e.id}" ${e.id === selectedId ? 'selected' : ''}>${label}</option>`;
    }).join('');
    this.updateCustomSelect('sel-entity');
  },

  /**
   * 更新或创建自定义下拉框
   * @param {string} selectId
   */
  updateCustomSelect(selectId) {
    const sel = document.getElementById(selectId);
    if (!sel) return;

    let wrapper = sel.nextElementSibling;
    if (!wrapper || !wrapper.classList.contains('custom-select-wrapper')) {
      wrapper = document.createElement('div');
      wrapper.className = 'custom-select-wrapper';
      wrapper.dataset.selectId = selectId;
      
      sel.style.display = 'none';
      sel.parentNode.insertBefore(wrapper, sel.nextSibling);

      const trigger = document.createElement('div');
      trigger.className = 'custom-select-trigger';
      trigger.setAttribute('tabindex', '0');
      trigger.innerHTML = `<span class="custom-select-value"></span><span class="custom-select-arrow"></span>`;
      wrapper.appendChild(trigger);

      const optionsPanel = document.createElement('div');
      optionsPanel.className = 'custom-select-options';
      wrapper.appendChild(optionsPanel);

      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.custom-select-wrapper').forEach(w => {
          if (w !== wrapper) w.classList.remove('open');
        });
        wrapper.classList.toggle('open');
      });

      trigger.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
          e.preventDefault();
          wrapper.classList.add('open');
          const firstOpt = optionsPanel.querySelector('.custom-select-option');
          if (firstOpt) firstOpt.focus();
        }
      });
    }

    const triggerVal = wrapper.querySelector('.custom-select-value');
    const optionsPanel = wrapper.querySelector('.custom-select-options');

    const selectedOption = sel.options[sel.selectedIndex];
    triggerVal.textContent = selectedOption ? selectedOption.textContent : '';

    optionsPanel.innerHTML = Array.from(sel.options).map((opt) => {
      const isSelected = opt.selected;
      return `<div class="custom-select-option ${isSelected ? 'selected' : ''}" 
                   data-value="${opt.value}" 
                   tabindex="0"
                   role="option" 
                   aria-selected="${isSelected}">${opt.textContent}</div>`;
    }).join('');

    optionsPanel.querySelectorAll('.custom-select-option').forEach(optEl => {
      optEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const val = optEl.dataset.value;
        sel.value = val;
        sel.dispatchEvent(new Event('change'));
        wrapper.classList.remove('open');
        wrapper.querySelector('.custom-select-trigger').focus();
      });

      optEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const val = optEl.dataset.value;
          sel.value = val;
          sel.dispatchEvent(new Event('change'));
          wrapper.classList.remove('open');
          wrapper.querySelector('.custom-select-trigger').focus();
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          const next = optEl.nextElementSibling;
          if (next) next.focus();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          const prev = optEl.previousElementSibling;
          if (prev) prev.focus();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          wrapper.classList.remove('open');
          wrapper.querySelector('.custom-select-trigger').focus();
        }
      });
    });
  },

  /**
   * 渲染选手/队伍名称和标签
   * @param {string} name
   * @param {Array} tags  [{label, color}, ...]
   */
  renderHeader(name, tags = []) {
    const nameEl = document.getElementById('t-name');
    const tagsEl = document.getElementById('t-tags');
    if (nameEl) nameEl.textContent = name || '—';
    if (tagsEl) {
      tagsEl.innerHTML = tags.map(t =>
        `<div class="tag ${t.color || 'blue'}">${t.label}</div>`
      ).join('');
    }
  },

  /**
   * 渲染顶部双评分卡
   * @param {Object} textScore  {value, rank, total, subtitle}
   * @param {Object} seasonRating  {value, rank, total, subtitle}
   */
  renderScores(textScore, seasonRating) {
    const ts = textScore || {};
    const sr = seasonRating || {};

    this._setScore('s1', ts, '综合评分');
    this._setScore('s2', sr, '赛季评分');
  },

  /**
   * 设置单个评分卡内容
   * @private
   */
  _setScore(prefix, data, defaultSub) {
    const sub = document.getElementById(`${prefix}-sub`);
    const val = document.getElementById(`${prefix}-val`);
    const rank = document.getElementById(`${prefix}-rank`);
    const bar = document.getElementById(`${prefix}-bar`);

    if (sub) sub.textContent = data.subtitle || defaultSub;
    if (val) val.textContent = data.value != null ? data.value : '—';
    if (rank) {
      rank.textContent = data.rank
        ? `#${data.rank}/${data.total || ''}`
        : '#—';
    }
    if (bar) {
      const pct = Math.min(100, (data.value || 0) / 18);
      bar.style.width = pct + '%';
    }
  },

  /**
   * 渲染数据网格（详情卡）
   * @param {Object} rawData  来自 RadarSubject.raw
   * @param {'player'|'team'} type
   */
  renderMetaGrid(rawData, type = 'player') {
    const grid = document.getElementById('meta-grid');
    if (!grid || !rawData) return;

    const r = rawData;
    const cells = type === 'player' ? [
      { label: '场次', val: r.games || 0, sub: `${r.wins || 0}W-${r.losses || 0}L` },
      { label: '胜率', val: ((r.win_rate || 0) * 100).toFixed(0) + '%', sub: '' },
      { label: 'KDA', val: (r.kda || 0).toFixed(2), sub: '' },
      { label: 'DPM', val: Math.round(r.avg_dpm || 0), sub: '' },
      { label: '英雄池', val: r.champion_pool || 0, sub: '' },
      { label: 'GD@15', val: this._signNum(r.avg_gd15), sub: '' },
    ] : [
      { label: '场次', val: r.games || 0, sub: `${r.wins || 0}W-${r.losses || 0}L` },
      { label: '胜率', val: ((r.win_rate || 0) * 100).toFixed(0) + '%', sub: '' },
      { label: '时长', val: r.avg_game_length || '—', sub: '分钟' },
      { label: 'GSPD', val: this._signNum(r.avg_gspd, 3), sub: '' },
      { label: 'GPR', val: (r.avg_gpr || 0).toFixed(3), sub: '' },
      { label: '场均龙', val: (r.avg_dragons || 0).toFixed(1), sub: '' },
    ];

    grid.innerHTML = cells.map(c => `
      <div class="meta">
        <div class="meta-label">${c.label}</div>
        <div class="meta-val">${c.val}${c.sub ? `<span class="meta-sub">${c.sub}</span>` : ''}</div>
      </div>
    `).join('');
  },

  /**
   * 渲染评分排行榜
   * @param {Array} entities        当前赛季的所有实体列表
   * @param {string} currentId       当前被选中的实体 ID
   * @param {'player'|'team'} type   数据类型
   * @param {Object} currentData     当前被选中的实体详细数据
   */
  renderRanking(entities, currentId, type, currentData) {
    const listEl = document.getElementById('ranking-list');
    const titleEl = document.getElementById('ranking-title');
    if (!listEl) return;

    if (!entities || !entities.length || !currentData) {
      listEl.innerHTML = '<div class="ranking-empty">暂无排行数据</div>';
      return;
    }

    let filtered = [];
    if (type === 'player') {
      // 筛选出同位置的选手
      const currentEntity = entities.find(e => e.id === currentId);
      const currentPos = currentEntity?.position;
      if (currentPos) {
        filtered = entities.filter(e => e.position === currentPos);
        const posLabels = { top: '上单', jng: '打野', mid: '中单', bot: '下路', sup: '辅助' };
        if (titleEl) titleEl.textContent = `${posLabels[currentPos] || currentPos.toUpperCase()}评分排行`;
      } else {
        filtered = [...entities];
        if (titleEl) titleEl.textContent = '选手评分排行';
      }
    } else {
      filtered = [...entities];
      if (titleEl) titleEl.textContent = '战队评分排行';
    }

    // 按照分数降序排序（虽然接口已排序，这里再做一次防错）
    filtered.sort((a, b) => (b.text_score || 0) - (a.text_score || 0));

    // 生成列表 HTML
    listEl.innerHTML = filtered.map((e, idx) => {
      const isSelected = e.id === currentId;
      const name = e.name || e.current_handle || '—';
      const score = Math.round(e.text_score || 0);
      const rank = idx + 1;
      const teamLabel = e.team_name ? `<span class="rank-team">${e.team_name}</span>` : '';
      const posLabel = type === 'player' && e.position ? `<span class="rank-pos pos-${e.position}">${e.position.toUpperCase()}</span>` : '';

      return `
        <div class="ranking-item ${isSelected ? 'active' : ''}" data-id="${e.id}">
          <span class="rank-number rank-${rank <= 3 ? rank : 'normal'}">${rank}</span>
          <div class="rank-info">
            <span class="rank-name">${name}</span>
            <div class="rank-meta">
              ${posLabel}
              ${teamLabel}
            </div>
          </div>
          <span class="rank-score">${score}</span>
        </div>
      `;
    }).join('');

    // 点击项切换选手/队伍
    listEl.querySelectorAll('.ranking-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.dataset.id;
        if (id && window.AppStateHandlers && window.AppStateHandlers.onEntityChange) {
          window.AppStateHandlers.onEntityChange(id);
        }
      });
    });
  },

  /**
   * 渲染公式说明区
   * @param {Object} note  {items, note}
   */
  renderFormulaNote(note) {
    const container = document.getElementById('formula-note');
    const body = document.getElementById('fn-body');
    if (!container || !body) return;

    if (!note?.items?.length) {
      container.style.display = 'none';
      return;
    }
    container.style.display = '';

    body.innerHTML = note.items.map(it => `
      <div class="fn-item">
        <span class="fn-en">${this.DIM_EN[it.label] || ''}</span>
        <span class="fn-dim">${it.label}</span>
        <span class="fn-field"> ${it.fields || ''}</span>
        <br>${it.formula || ''}
      </div>
    `).join('') + `<div class="fn-foot">${note.note || ''}</div>`;
  },

  /**
   * 更新雷达图图例文案
   * @param {'player'|'team'} type
   */
  updateLegend(type) {
    const selfLabel = document.getElementById('lg-self');
    const avgLabel = document.getElementById('lg-avg');
    if (selfLabel) selfLabel.textContent = type === 'player' ? '该选手' : '该队伍';
    if (avgLabel) avgLabel.textContent = type === 'player' ? '同位置均值' : '联赛均值';
  },

  /**
   * 更新主题切换按钮图标
   * @param {'dark'|'light'} theme
   */
  updateThemeIcon(theme) {
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = theme === 'dark' ? '☀' : '🌙';
  },

  /**
   * 显示/隐藏加载遮罩
   * @param {boolean} isLoading
   */
  setLoading(isLoading) {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.toggle('active', isLoading);
  },

  /**
   * 显示错误提示（3 秒后自动消失）
   * @param {string} message
   */
  showError(message) {
    const toast = document.getElementById('error-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('active');
    clearTimeout(this._errorTimer);
    this._errorTimer = setTimeout(() => {
      toast.classList.remove('active');
    }, 4000);
  },
  _errorTimer: null,

  bindEvents(handlers) {
    window.AppStateHandlers = handlers; // 保存全局引用供排行切换使用

    // 点击外部关闭所有自定义下拉框
    document.addEventListener('click', () => {
      document.querySelectorAll('.custom-select-wrapper').forEach(w => {
        w.classList.remove('open');
      });
    });

    // Tab 切换
    document.querySelectorAll('#seg-type button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('#seg-type button').forEach(b => {
          b.classList.remove('on');
          b.setAttribute('aria-selected', 'false');
        });
        e.target.classList.add('on');
        e.target.setAttribute('aria-selected', 'true');
        handlers.onTypeChange(e.target.dataset.type);
      });
    });

    // 赛季切换
    const seasonSel = document.getElementById('sel-season');
    if (seasonSel) {
      seasonSel.addEventListener('change', e => handlers.onSeasonChange(e.target.value));
    }

    // 实体切换
    const entitySel = document.getElementById('sel-entity');
    if (entitySel) {
      entitySel.addEventListener('change', e => handlers.onEntityChange(e.target.value));
    }

    // 主题切换
    const themeBtn = document.getElementById('theme-toggle');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => handlers.onThemeToggle());
    }
  },

  /**
   * 格式化带符号的数字
   * @private
   */
  _signNum(val, decimals = 0) {
    const v = val || 0;
    const num = decimals ? v.toFixed(decimals) : Math.round(v);
    return v >= 0 ? '+' + num : '' + num;
  },
};
