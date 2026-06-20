// ============================================================
// LoL Radar · 前端逻辑
// 规范见 /skills/lol-radar-ui/SKILL.md
// 关键：雷达复用同一 Chart 实例 + update() 平滑过渡（不 destroy）
// ============================================================
const state = { type:'player', season:null, entity:null };
const $ = id => document.getElementById(id);
let chart = null;
const PULSE = { raf:null, period:1300 };   // 满点脉冲状态(R3, overlay 画布)
// 维度英文短名（轴标签用，避免中文挤占雷达空间；中文名+原理见底部公式区）
const DIM_EN = {
  d_teamfight:'Teamfight', d_laning:'Laning', d_macro:'Macro',
  d_mechanics:'Mechanics', d_consistency:'Consistency', d_meta_adapt:'Adaptation',
};

// 静态(GitHub Pages)/动态(Flask) 自动判别
let STATIC_MODE = null;
async function detectMode(){
  if (STATIC_MODE !== null) return STATIC_MODE;
  try { STATIC_MODE = (await fetch('./data/seasons.json',{method:'HEAD'})).ok; }
  catch(e){ STATIC_MODE = false; }
  return STATIC_MODE;
}
async function jget(staticPath, apiPath){
  const isS = await detectMode();
  return fetch(isS ? './data/'+staticPath : '/api/'+apiPath).then(r=>r.json());
}
const safe = s => s.replace(/\//g,'_').replace(/:/g,'_');

init();
async function init(){
  document.querySelectorAll('#seg-type button').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('#seg-type button').forEach(b=>b.classList.remove('on'));
      btn.classList.add('on');
      state.type = btn.dataset.type;
      reloadEntities();
    });
  });
  await loadSeasons();
  $('sel-season').addEventListener('change', ()=>{ state.season=$('sel-season').value; reloadEntities(); });
  $('sel-entity').addEventListener('change', ()=>{ state.entity=$('sel-entity').value; renderSubject(); });
  await reloadEntities();
}

async function loadSeasons(){
  const isS = await detectMode();
  let all;
  if (isS){ all = await jget('seasons.json'); }
  else {
    const lgs = await fetch('/api/leagues').then(r=>r.json());
    all = [];
    for (const lg of lgs){
      (await fetch(`/api/seasons?league_id=${lg.id}`).then(r=>r.json())).forEach(s=>all.push(s));
    }
  }
  all.sort((a,b)=>(a.league_id+a.id).localeCompare(b.league_id+b.id));
  $('sel-season').innerHTML = all.map(s=>`<option value="${s.id}">${s.id}</option>`).join('');
  const def = all.find(s=>s.id==='LCK-2026-Cup') || all[0];
  $('sel-season').value = def.id; state.season = def.id;
}

async function reloadEntities(){
  const sel = $('sel-entity'); const isS = await detectMode();
  let list;
  if (state.type==='player'){
    if (isS){ list = (await jget(`season/${safe(state.season)}/list.json`)).players.map(p=>({...p,current_handle:p.name})); }
    else { list = await fetch(`/api/players?season_id=${state.season}`).then(r=>r.json()); }
    sel.innerHTML = list.map(p=>`<option value="${p.id}">${p.current_handle} · ${p.position} · #${p.r_position}</option>`).join('');
  } else {
    if (isS){ list = (await jget(`season/${safe(state.season)}/list.json`)).teams; }
    else { list = await fetch(`/api/teams?season_id=${state.season}`).then(r=>r.json()); }
    sel.innerHTML = list.map(t=>`<option value="${t.id}">${t.name}</option>`).join('');
  }
  state.entity = list[0]?.id;
  if (state.entity) await renderSubject();
}

async function renderSubject(){
  if (!state.entity) return;
  const isS = await detectMode();
  let data;
  if (isS){ data = await jget(`season/${safe(state.season)}/${state.type}/${safe(state.entity)}.json`); }
  else {
    const u = state.type==='player'
      ? `/api/player/${encodeURIComponent(state.entity)}?season_id=${state.season}`
      : `/api/team/${encodeURIComponent(state.entity)}?season_id=${state.season}`;
    data = await fetch(u).then(r=>r.json());
  }
  if (!data || data.error){ console.warn(data); return; }

  // 标题/标签
  $('t-name').textContent = data.name;
  $('t-tags').innerHTML = data.tags.map(t=>`<div class="tag ${t.color}">${t.label}</div>`).join('');
  // 双指标
  const ts=data.top_stats.text_score, sr=data.top_stats.season_rating;
  $('s1-sub').textContent=ts.subtitle; $('s1-val').textContent=ts.value;
  $('s1-rank').textContent=`#${ts.rank}/${ts.total}`; $('s1-bar').style.width=Math.min(100,ts.value/16)+'%';
  $('s2-sub').textContent=sr.subtitle; $('s2-val').textContent=sr.value;
  $('s2-rank').textContent=`#${sr.rank}/${sr.total}`; $('s2-bar').style.width=Math.min(100,sr.value/16)+'%';
  // 图例
  $('lg-self').textContent = state.type==='player'?'该选手':'该队伍';
  $('lg-avg').textContent  = state.type==='player'?'同位置均值':'联赛均值';
  // 数据卡 + 公式区
  renderMeta(data);
  renderFormula(data.formula_note);
  // 雷达（平滑更新）
  drawRadar(data.dimensions);
}

function renderMeta(data){
  const r=data.raw||{}; let cells=[];
  if (data.type==='player'){
    cells=[
      ['场次', `${r.games}`, `${r.wins}-${r.losses}`],
      ['场均KDA', r.kda, ''],
      ['英雄池', r.champion_pool, ''],
      ['场均DPM', r.avg_dpm, ''],
      ['视野/分', r.avg_vspm, ''],
      ['15分金差', (r.avg_gd15>=0?'+':'')+r.avg_gd15, ''],
    ];
  } else {
    cells=[
      ['场次', `${r.games}`, `${r.wins}-${r.losses}`],
      ['胜率', (r.win_rate*100).toFixed(0), '%'],
      ['场均时长', r.avg_game_length, '分'],
      ['经济差GSPD', (r.avg_gspd>=0?'+':'')+(r.avg_gspd*100).toFixed(1), '%'],
      ['黄金比率GPR', r.avg_gpr, ''],
      ['场均小龙', r.avg_dragons, ''],
    ];
  }
  $('meta-grid').innerHTML = cells.map(([l,v,sub])=>`
    <div class="meta">
      <div class="meta-label">${l}</div>
      <div class="meta-val">${v}${sub?`<span class="meta-sub">${sub}</span>`:''}</div>
    </div>`).join('');
}

function renderFormula(fn){
  if (!fn){ $('formula-note').style.display='none'; return; }
  $('formula-note').style.display='';
  const EN = {团战决策:'Teamfight',线上压制:'Laning',长线运营:'Macro',
              操作上限:'Mechanics',心态稳定:'Consistency',版本适应:'Adaptation'};
  const items = fn.items.map(it=>`
    <div class="fn-item">
      <span class="fn-en">${EN[it.label]||''}</span>
      <span class="fn-dim">${it.label}</span>
      <span class="fn-field">（${it.fields}）</span><br>
      ${it.formula}
    </div>`).join('');
  $('fn-body').innerHTML = items + `<div class="fn-foot">${fn.note}</div>`;
}

// ============================================================
// 雷达图：复用同一实例，仅 update() 做补间动画（第 5 点）
// 自定义 plugin 画：维度名 + 字段名(第3点) + 双数值 + 排名胶囊
// ============================================================
let radarMeta = { labels:[], fields:[], self:[], avg:[], ranks:[] };

function drawRadar(dims){
  radarMeta = {
    labels: dims.map(d=>d.label),
    en:     dims.map(d=>DIM_EN[d.key]||d.label),
    fields: dims.map(d=>d.fields||''),
    self:   dims.map(d=>d.value),
    avg:    dims.map(d=>d.avg),
    ranks:  dims.map(d=>d.rank?`#${d.rank}/${d.total}`:''),
  };

  if (chart){
    // —— R4 平滑切换：复用实例，过渡期间暂停脉冲，避免卡顿 —— //
    chart.data.labels = radarMeta.labels;
    chart.data.datasets[0].data = radarMeta.self;
    chart.data.datasets[1].data = radarMeta.avg;
    chart.update();                       // easeInOutCubic 补间（见 options）
    return;
  }

  const ctx = document.getElementById('radar');
  const css = getComputedStyle(document.documentElement);
  const C = n => css.getPropertyValue(n).trim();

  // —— 轴标签插件：维度名 + 字段名 + 双数值 + 排名胶囊 —— //
  const axisLabelPlugin = {
    id:'axisLabel',
    afterDraw(c){
      const r=c.scales.r; if(!r) return;
      const ct=c.ctx; const cx=r.xCenter, cy=r.yCenter, rad=r.drawingArea+22;
      ct.save();
      for(let i=0;i<radarMeta.labels.length;i++){
        const ang=r.getIndexAngle(i)-Math.PI/2;
        const px=cx+Math.cos(ang)*rad, py=cy+Math.sin(ang)*rad;
        ct.textAlign='center'; ct.textBaseline='middle';
        const rank=radarMeta.ranks[i];
        if (rank){
          ct.font='600 9px '+C('--font-sans');
          const w=ct.measureText(rank).width+10, ry=py-22;
          ct.fillStyle=C('--accent-bg'); roundRect(ct,px-w/2,ry-7,w,14,7); ct.fill();
          ct.fillStyle=C('--accent'); ct.fillText(rank,px,ry);
        }
        // 维度英文短名（更紧凑，不戳进雷达）
        ct.font='600 12px '+C('--font-sans');
        ct.fillStyle=C('--ink'); ct.fillText(radarMeta.en[i],px,py-3);
        // 双数值（蓝=本人 橙=均值）
        ct.font='600 11px '+C('--font-sans');
        ct.fillStyle=C('--blue');   ct.fillText(radarMeta.self[i],px-16,py+12);
        ct.fillStyle=C('--muted');  ct.fillText('/',px,py+12);
        ct.fillStyle=C('--orange'); ct.fillText(radarMeta.avg[i], px+16,py+12);
      }
      ct.restore();
    }
  };

  chart = new Chart(ctx,{
    type:'radar',
    data:{
      labels: radarMeta.labels,
      datasets:[
        { label:'self', data:radarMeta.self, borderColor:C('--blue'),
          backgroundColor:C('--blue-fill'), borderWidth:2,
          pointRadius:3, pointBackgroundColor:C('--blue'),
          pointBorderColor:'#fff', pointBorderWidth:1.5 },
        { label:'avg', data:radarMeta.avg, borderColor:C('--orange'),
          backgroundColor:C('--orange-fill'), borderWidth:2, borderDash:[5,4],
          pointRadius:3, pointBackgroundColor:C('--orange'),
          pointBorderColor:'#fff', pointBorderWidth:1.5 },
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      // R4：更顺滑的缓动，统一过渡
      animation:{ duration:620, easing:'easeInOutCubic' },
      animations:{ r:{ type:'number', easing:'easeInOutCubic', duration:620 } },
      layout:{ padding:{ top:34, bottom:34, left:46, right:46 } },
      plugins:{ legend:{display:false}, tooltip:{enabled:false} },
      scales:{ r:{
        min:0, max:100,
        ticks:{ display:false, stepSize:20 },
        grid:{ color:C('--line'), lineWidth:1, circular:false },
        angleLines:{ color:C('--line'), lineWidth:1 },
        pointLabels:{ display:false }
      }}
    },
    plugins:[ axisLabelPlugin ],
  });

  // 启动 overlay 脉冲循环：在独立画布上绘制，绝不触碰 Chart 状态
  startPulse();
}

function roundRect(c,x,y,w,h,r){
  c.beginPath(); c.moveTo(x+r,y); c.lineTo(x+w-r,y);
  c.quadraticCurveTo(x+w,y,x+w,y+r); c.lineTo(x+w,y+h-r);
  c.quadraticCurveTo(x+w,y+h,x+w-r,y+h); c.lineTo(x+r,y+h);
  c.quadraticCurveTo(x,y+h,x,y+h-r); c.lineTo(x,y+r);
  c.quadraticCurveTo(x,y,x+r,y); c.closePath();
}

// ============================================================
// R3 满点脉冲：独立 overlay 画布，读取 Chart 点坐标但不修改 Chart
// 不调用 chart.update，因此绝不会打断雷达进入/切换动画
// ============================================================
function startPulse(){
  if (PULSE.raf) return;            // 只启动一次
  const fx = document.getElementById('radar-fx');
  if (!fx) return;
  const fctx = fx.getContext('2d');
  const css = getComputedStyle(document.documentElement);
  const blue = css.getPropertyValue('--blue').trim();
  const THRESHOLD = 90;

  function frame(){
    PULSE.raf = requestAnimationFrame(frame);
    if (!chart) return;
    const main = chart.canvas;
    const cssW = main.clientWidth, cssH = main.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    // overlay 设备像素尺寸对齐主画布，并用 dpr 缩放，使绘图用 CSS 坐标
    if (fx.width !== Math.round(cssW*dpr) || fx.height !== Math.round(cssH*dpr)){
      fx.width = Math.round(cssW*dpr); fx.height = Math.round(cssH*dpr);
      fx.style.width = cssW+'px'; fx.style.height = cssH+'px';
    }
    fctx.setTransform(dpr,0,0,dpr,0,0);
    fctx.clearRect(0,0,cssW,cssH);

    const meta = chart.getDatasetMeta(0);
    if (!meta || !meta.data) return;
    const t = (performance.now() % PULSE.period) / PULSE.period;
    const phase = Math.sin(t * Math.PI * 2) * 0.5 + 0.5;   // 0..1 呼吸

    for (let i=0;i<meta.data.length;i++){
      if ((radarMeta.self[i]||0) < THRESHOLD) continue;
      const pt = meta.data[i];
      if (!pt || pt.x == null) continue;
      const x = pt.x, y = pt.y;          // Chart.js 点坐标为 CSS 像素
      const ringR = 5 + phase * 9;
      const alpha = (1 - phase) * 0.5;
      fctx.beginPath();
      fctx.arc(x, y, ringR, 0, Math.PI*2);
      fctx.fillStyle = `rgba(59,91,165,${alpha.toFixed(3)})`;
      fctx.fill();
      fctx.beginPath();
      fctx.arc(x, y, 3.5 + phase*1.5, 0, Math.PI*2);
      fctx.fillStyle = blue;
      fctx.fill();
      fctx.lineWidth = 1.5; fctx.strokeStyle = '#fff'; fctx.stroke();
    }
  }
  frame();
}

