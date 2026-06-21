/**
 * LoL Radar · 应用入口
 * 职责：生命周期管理、事件→状态→渲染的协调
 * 依赖：API, AppState, RadarChart, UI（均为全局对象，由 index.html 按序加载）
 */
(function () {
  'use strict';

  // ============ 数据加载 ============

  /**
   * 加载赛季列表，并选择默认赛季
   */
  async function initSeasons() {
    const seasons = await API.getSeasons();
    AppState.set({ seasons });

    // 优先选 LCK-2026-Cup，否则取第一个
    const defaultSeason = seasons.find(s => s.id === 'LCK-2026-Cup') || seasons[0];
    if (defaultSeason) {
      await loadSeason(defaultSeason.id);
    }
  }

  /**
   * 加载指定赛季的实体列表 + 第一个实体
   * @param {string} seasonId
   */
  async function loadSeason(seasonId) {
    AppState.set({ seasonId, isLoading: true, error: null });

    try {
      const entities = await API.getEntities(seasonId, AppState.type);
      AppState.set({ entities });

      if (entities.length > 0) {
        await loadEntity(entities[0].id);
      } else {
        AppState.set({ entityId: null, currentData: null, isLoading: false });
      }
    } catch (err) {
      handleError(err);
    }
  }

  /**
   * 加载指定选手/队伍的完整雷达数据
   * @param {string} entityId
   */
  async function loadEntity(entityId) {
    AppState.set({ entityId, isLoading: true, error: null });

    try {
      const data = await API.getEntityData(AppState.seasonId, AppState.type, entityId);
      AppState.set({ currentData: data, isLoading: false });
    } catch (err) {
      handleError(err);
    }
  }

  /**
   * 统一错误处理
   * @param {Error} err
   */
  function handleError(err) {
    console.error('[App]', err);
    AppState.set({ isLoading: false, error: err.message });
    UI.showError('加载失败：' + (err.message || '未知错误'));
  }

  // ============ 渲染 ============

  /**
   * 主渲染函数 — 响应 AppState 变化
   */
  function render() {
    // 下拉框
    UI.renderSeasons(AppState.seasons, AppState.seasonId);
    UI.renderEntities(AppState.entities, AppState.entityId, AppState.type);

    // 加载状态
    UI.setLoading(AppState.isLoading);
    UI.updateThemeIcon(AppState.theme);

    const data = AppState.currentData;
    if (!data) return;

    // 标题 + 标签
    UI.renderHeader(data.name, data.tags);

    // 评分卡
    UI.renderScores(
      data.top_stats?.text_score,
      data.top_stats?.season_rating
    );

    // 数据网格
    UI.renderMetaGrid(data.raw, AppState.type);

    // 评分排行榜
    UI.renderRanking(AppState.entities, AppState.entityId, AppState.type, data);

    // 图例
    UI.updateLegend(AppState.type);

    // 公式说明
    UI.renderFormulaNote(data.formula_note);

    // 雷达图
    if (data.dimensions) {
      RadarChart.update(data.dimensions, AppState.type);
    }
  }

  // ============ 事件 Handler ============

  const handlers = {
    async onTypeChange(type) {
      AppState.setType(type);
      await loadSeason(AppState.seasonId);
    },

    async onSeasonChange(seasonId) {
      await loadSeason(seasonId);
    },

    async onEntityChange(entityId) {
      await loadEntity(entityId);
    },

    onThemeToggle() {
      AppState.toggleTheme();
    },
  };

  // ============ 启动 ============

  document.addEventListener('DOMContentLoaded', async () => {
    // 恢复主题
    AppState.restoreTheme();

    // 订阅状态 → 渲染
    AppState.subscribe(render);

    // 绑定 UI 事件
    UI.bindEvents(handlers);

    // 初始化雷达图
    RadarChart.init('radar', 'radar-fx');

    // 加载数据
    try {
      await initSeasons();
    } catch (err) {
      handleError(err);
    }
  });
})();
