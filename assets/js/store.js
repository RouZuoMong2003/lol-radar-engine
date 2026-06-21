/**
 * 应用状态管理 — 单一数据源 + 发布-订阅
 * 所有 UI 渲染都基于这里的状态
 */
const AppState = {
  // 核心状态
  type: 'player',      // 'player' | 'team'
  seasonId: null,      // 当前赛季 ID
  entityId: null,      // 当前选手/队伍 ID

  // 数据缓存
  seasons: [],         // 赛季列表
  entities: [],        // 当前赛季的选手/队伍列表
  currentData: null,   // 当前 RadarSubject 完整数据

  // UI 状态
  isLoading: false,
  error: null,
  theme: 'dark',       // 'dark' | 'light'

  // 事件总线
  _subscribers: [],

  /**
   * 订阅状态变化
   * @param {Function} callback
   * @returns {Function} unsubscribe
   */
  subscribe(callback) {
    this._subscribers.push(callback);
    return () => {
      this._subscribers = this._subscribers.filter(cb => cb !== callback);
    };
  },

  /** 通知所有订阅者 */
  _notify() {
    for (const cb of this._subscribers) {
      try { cb(this); } catch (e) { console.error('[Store] subscriber error:', e); }
    }
  },

  /**
   * 批量更新状态
   * @param {Object} updates
   */
  set(updates) {
    Object.assign(this, updates);
    this._notify();
  },

  // 语义化快捷方法
  setType(type) { this.set({ type }); },
  setSeason(seasonId) { this.set({ seasonId, entityId: null }); },
  setEntity(entityId) { this.set({ entityId }); },
  setLoading(isLoading) { this.set({ isLoading }); },
  setError(error) { this.set({ error }); },

  /**
   * 切换主题
   */
  toggleTheme() {
    this.theme = this.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', this.theme);
    localStorage.setItem('lol-radar-theme', this.theme);
    this._notify();
  },

  /**
   * 从 localStorage 恢复主题
   */
  restoreTheme() {
    const saved = localStorage.getItem('lol-radar-theme');
    if (saved) {
      this.theme = saved;
      document.documentElement.setAttribute('data-theme', saved);
    }
  },

  /**
   * 获取雷达图渲染数据
   * @returns {Object|null}
   */
  getRadarData() {
    if (!this.currentData?.dimensions) return null;
    return {
      dimensions: this.currentData.dimensions,
      playerScore: this.currentData.top_stats?.text_score,
      seasonRating: this.currentData.top_stats?.season_rating,
      meta: this.currentData.raw,
      formulaNote: this.currentData.formula_note,
    };
  }
};
