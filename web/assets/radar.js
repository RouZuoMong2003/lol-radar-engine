// ==== 状态 & DOM 引用 ====
const state = { type: 'player', season: null, entity: null };
const $ = id => document.getElementById(id);
let chart = null;

// ==== 初始化 ====
init();
async function init(){
  // tab 切换
  document.querySelectorAll('#seg-type button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#seg-type button').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      state.type = btn.dataset.type;
      reloadEntities();
    });
  });

  // 加载赛季列表（先取 LCK 一级赛区作为默认；用户可以选别的）
  await loadSeasons();
  $('sel-season').addEventListener('change', () => {
    state.season = $('sel-season').value;
    reloadEntities();
  });
  $('sel-entity').addEventListener('change', () => {
    state.entity = $('sel-entity').value;
    renderSubject();
  });

  await reloadEntities();
}

async function loadSeasons(){
  // 取所有有数据的赛季（按 league_id 一线优先）
  const leagues = await fetch('/api/leagues').then(r => r.json());
  const allSeasons = [];
  for (const lg of leagues){
    const ss = await fetch(`/api/seasons?league_id=${lg.id}`).then(r => r.json());
    ss.forEach(s => allSeasons.push(s));
  }
  // 优先 LCK Cup
  allSeasons.sort((a,b) => (a.league_id+a.id).localeCompare(b.league_id+b.id));
  const sel = $('sel-season');
  sel.innerHTML = allSeasons.map(s => `<option value="${s.id}">${s.id}</option>`).join('');
  const def = allSeasons.find(s => s.id === 'LCK-2026-Cup') || allSeasons[0];
  sel.value = def.id;
  state.season = def.id;
}

async function reloadEntities(){
  const sel = $('sel-entity');
  if (state.type === 'player'){
    const list = await fetch(`/api/players?season_id=${state.season}`).then(r => r.json());
    sel.innerHTML = list.map(p =>
      `<option value="${p.id}">${p.current_handle} (${p.position}) · ${p.team_name||''} · #${p.r_position}</option>`
    ).join('');
    state.entity = list[0]?.id;
  } else {
    const list = await fetch(`/api/teams?season_id=${state.season}`).then(r => r.json());
    sel.innerHTML = list.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    state.entity = list[0]?.id;
  }
  if (state.entity) await renderSubject();
}

// ==== 渲染主体 ====
async function renderSubject(){
  if (!state.entity) return;
  const url = state.type === 'player'
    ? `/api/player/${encodeURIComponent(state.entity)}?season_id=${state.season}`
    : `/api/team/${encodeURIComponent(state.entity)}?season_id=${state.season}`;
  const data = await fetch(url).then(r => r.json());
  if (data.error){ console.warn(data); return; }

  // 标题/标签
  $('t-name').textContent = data.name;
  $('t-tags').innerHTML = data.tags.map(t =>
    `<div class="tag ${t.color}">${t.label}</div>`).join('');
  // 双指标
  const ts = data.top_stats.text_score, sr = data.top_stats.season_rating;
  $('s1-sub').textContent = ts.subtitle; $('s1-val').textContent = ts.value;
  $('s1-rank').textContent = `#${ts.rank}/${ts.total}`;
  $('s1-bar').style.width  = Math.min(100, ts.value/16) + '%';
  $('s2-sub').textContent = sr.subtitle; $('s2-val').textContent = sr.value;
  $('s2-rank').textContent = `#${sr.rank}/${sr.total}`;
  $('s2-bar').style.width  = Math.min(100, sr.value/16) + '%';
  // 图例文案
  $('lg-self').textContent = state.type==='player' ? '该选手' : '该队伍';
  $('lg-avg').textContent  = state.type==='player' ? '同位置均值' : '联赛均值';
  // 详情卡
  renderMeta(data);
  // 页脚
  $('f-id').textContent = data.id.split(':').pop().slice(0,12);
  $('f-season').textContent = data.season_id;
  // 雷达
  drawRadar(data.dimensions);
}

function renderMeta(data){
  const r = data.raw || {};
  let cells = [];
  if (data.type === 'player'){
    cells = [
      ['场次', `${r.games}`, `${r.wins}-${r.losses}`],
      ['场均KDA', r.kda, ''],
      ['英雄池', r.champion_pool, '个'],
      ['场均DPM', r.avg_dpm, ''],
      ['视野/分', r.avg_vspm, ''],
      ['15分金差', (r.avg_gd15>=0?'+':'')+r.avg_gd15, ''],
    ];
  } else {
    cells = [
      ['场次', `${r.games}`, `${r.wins}-${r.losses}`],
      ['胜率', (r.win_rate*100).toFixed(1), '%'],
      ['场均时长', r.avg_game_length, '分'],
      ['GSPD', (r.avg_gspd>=0?'+':'')+(r.avg_gspd*100).toFixed(1), '%'],   // ★ EGR 类
      ['GPR',  r.avg_gpr, ''],
      ['场均龙', r.avg_dragons, ''],
    ];
  }
  $('meta-row').innerHTML = cells.map(([lbl, val, unit]) => `
    <div class="meta">
      <div class="meta-label">${lbl}</div>
      <div class="meta-val">${val}<span class="meta-unit">${unit}</span></div>
    </div>`).join('');
}

// ==== Chart.js 雷达（沿用 lol-radar 的双层 + 自定义轴标签 plugin） ====
function drawRadar(dims){
  const labels = dims.map(d => d.label);
  const self   = dims.map(d => d.value);
  const avg    = dims.map(d => d.avg);
  const ranks  = dims.map(d => d.rank ? `#${d.rank}/${d.total}` : '');

  if (chart) chart.destroy();
  const ctx = document.getElementById('radar');

  const axisLabelPlugin = {
    id:'axisLabel',
    afterDraw(c){
      const r = c.scales.r; if(!r) return;
      const cx=r.xCenter, cy=r.yCenter, rad=r.drawingArea+24;
      const x=ctx => ctx; // noop
      const ct = c.ctx; ct.save();
      for(let i=0;i<labels.length;i++){
        const ang = r.getIndexAngle(i) - Math.PI/2;
        const px = cx + Math.cos(ang)*rad;
        const py = cy + Math.sin(ang)*rad;
        ct.textAlign='center'; ct.textBaseline='middle';
        // rank 胶囊
        ct.font='600 10px PingFang SC, sans-serif';
        const rank = ranks[i];
        const w = ct.measureText(rank).width + 12;
        const ry = py - 22;
        ct.fillStyle = '#EDE8FF';
        roundRect(ct, px-w/2, ry-8, w, 16, 8); ct.fill();
        ct.fillStyle = '#6B5BD6'; ct.fillText(rank, px, ry);
        // 维度名
        ct.font='600 12px PingFang SC, sans-serif';
        ct.fillStyle='#2C2C2C'; ct.fillText(labels[i], px, py);
        // 数值（蓝/橙）
        ct.font='600 11px PingFang SC, sans-serif';
        ct.fillStyle='#3B5BA5'; ct.fillText(self[i], px-22, py+15);
        ct.fillStyle='#D97757'; ct.fillText(avg[i],  px+22, py+15);
      }
      ct.restore();
    }
  };

  chart = new Chart(ctx, {
    type:'radar',
    data:{
      labels,
      datasets:[
        { label:'self', data:self, borderColor:'#3B5BA5',
          backgroundColor:'rgba(59,91,165,0.20)', borderWidth:2,
          pointRadius:3, pointBackgroundColor:'#3B5BA5',
          pointBorderColor:'#FFFFFF', pointBorderWidth:1.5 },
        { label:'avg', data:avg, borderColor:'#D97757',
          backgroundColor:'rgba(217,119,87,0.18)', borderWidth:2, borderDash:[5,4],
          pointRadius:3, pointBackgroundColor:'#D97757',
          pointBorderColor:'#FFFFFF', pointBorderWidth:1.5 },
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false, animation:false,
      layout:{ padding:{ top:32, bottom:32, left:48, right:48 } },
      plugins:{ legend:{display:false}, tooltip:{enabled:false} },
      scales:{
        r:{ min:0, max:100,
            ticks:{ display:false, stepSize:20 },
            grid:{ color:'rgba(44,44,44,0.10)', lineWidth:1, circular:false },
            angleLines:{ color:'rgba(44,44,44,0.10)', lineWidth:1 },
            pointLabels:{ display:false } }
      }
    },
    plugins:[ axisLabelPlugin ],
  });
}

function roundRect(c,x,y,w,h,r){
  c.beginPath();
  c.moveTo(x+r,y); c.lineTo(x+w-r,y);
  c.quadraticCurveTo(x+w,y,x+w,y+r);
  c.lineTo(x+w,y+h-r);
  c.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  c.lineTo(x+r,y+h);
  c.quadraticCurveTo(x,y+h,x,y+h-r);
  c.lineTo(x,y+r);
  c.quadraticCurveTo(x,y,x+r,y);
  c.closePath();
}
