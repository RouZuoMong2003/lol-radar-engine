/**
 * API 接口层
 * 自动检测：静态 JSON 模式 / Flask API 模式
 * 统一数据格式，上层无需关心数据源
 */
const API = {
  /** @type {boolean|null} */
  _isStatic: null,

  /**
   * 检测运行模式（静态 vs Flask）
   * @returns {Promise<void>}
   */
  async init() {
    if (this._isStatic !== null) return;
    try {
      const res = await fetch('/healthz', { signal: AbortSignal.timeout(5000) });
      this._isStatic = !res.ok;
    } catch {
      this._isStatic = true;
    }
  },

  /**
   * 获取所有赛季列表
   * @returns {Promise<Array>}
   */
  async getSeasons() {
    await this.init();
    if (this._isStatic) {
      return this._fetchJSON('./data/seasons.json');
    }
    return this._fetchJSON('/api/seasons');
  },

  /**
   * 获取赛季内的选手/队伍列表
   * @param {string} seasonId
   * @param {'player'|'team'} type
   * @returns {Promise<Array>}
   */
  async getEntities(seasonId, type = 'player') {
    await this.init();
    if (this._isStatic) {
      const safeId = this._safePath(seasonId);
      const data = await this._fetchJSON(`./data/season/${safeId}/list.json`);
      return type === 'player' ? data.players : data.teams;
    }
    const endpoint = type === 'player' ? '/api/players' : '/api/teams';
    return this._fetchJSON(`${endpoint}?season_id=${encodeURIComponent(seasonId)}`);
  },

  /**
   * 获取选手/队伍的完整雷达数据 (RadarSubject)
   * @param {string} seasonId
   * @param {'player'|'team'} type
   * @param {string} entityId
   * @returns {Promise<Object>}
   */
  async getEntityData(seasonId, type, entityId) {
    await this.init();
    if (this._isStatic) {
      const safeSeasonId = this._safePath(seasonId);
      const safeEntityId = this._safePath(entityId.split(':').pop() || entityId);
      return this._fetchJSON(`./data/season/${safeSeasonId}/${type}/${safeEntityId}.json`);
    }
    const endpoint = type === 'player' ? '/api/player' : '/api/team';
    return this._fetchJSON(
      `${endpoint}/${encodeURIComponent(entityId)}?season_id=${encodeURIComponent(seasonId)}`
    );
  },

  /**
   * 通用 JSON 请求 + 错误处理
   * @param {string} url
   * @returns {Promise<any>}
   */
  async _fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`API ${res.status}: ${text || res.statusText}`);
    }
    return res.json();
  },

  /**
   * 路径安全化：替换特殊字符
   * @param {string} id
   * @returns {string}
   */
  _safePath(id) {
    return id.replace(/[\/\\:]/g, '_');
  }
};
