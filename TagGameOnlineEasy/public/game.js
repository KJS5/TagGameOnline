const socket = io();
const menu = document.getElementById('menu');
const game = document.getElementById('game');
const nameBox = document.getElementById('name');
const codeBox = document.getElementById('code');
const err = document.getElementById('err');
const roomCodeText = document.getElementById('roomCode');
const meText = document.getElementById('me');
const startBtn = document.getElementById('start');
const restartBtn = document.getElementById('restart');
const copyBtn = document.getElementById('copy');
const c = document.getElementById('c');
const ctx = c.getContext('2d');

let state = null, me = null, code = null;
const platforms = [
  { x: 0, y: 560, w: 960, h: 40 }, { x: 85, y: 450, w: 235, h: 22 }, { x: 410, y: 450, w: 235, h: 22 },
  { x: 735, y: 450, w: 170, h: 22 }, { x: 160, y: 330, w: 220, h: 22 }, { x: 510, y: 330, w: 250, h: 22 },
  { x: 330, y: 220, w: 300, h: 22 }, { x: 55, y: 150, w: 180, h: 22 }, { x: 730, y: 150, w: 180, h: 22 }
];

document.getElementById('create').onclick = () => socket.emit('createRoom', { name: nameBox.value || 'Host' });
document.getElementById('join').onclick = () => socket.emit('joinRoom', { code: codeBox.value.trim(), name: nameBox.value || 'Player' });
startBtn.onclick = () => socket.emit('startGame');
restartBtn.onclick = () => socket.emit('restart');
copyBtn.onclick = async () => { await navigator.clipboard.writeText(location.origin + '?room=' + code); copyBtn.textContent = 'Copied!'; setTimeout(()=>copyBtn.textContent='Copy Link',900); };

const q = new URLSearchParams(location.search).get('room'); if(q) codeBox.value = q;
socket.on('joined', d => { me = d.playerId; code = d.code; menu.classList.add('hidden'); game.classList.remove('hidden'); roomCodeText.textContent = code; meText.textContent = me; });
socket.on('errorMsg', msg => err.textContent = msg);
socket.on('state', s => { state = s; if (s && s.code) { code = s.code; roomCodeText.textContent = code; } });

function input(key, down){ socket.emit('input', { key, down }); }
const down = new Set();
addEventListener('keydown', e => {
  const k = keyName(e); if(!k || down.has(k)) return; down.add(k); input(k,true); e.preventDefault();
});
addEventListener('keyup', e => { const k=keyName(e); if(!k) return; down.delete(k); input(k,false); e.preventDefault(); });
function keyName(e){ if(e.key==='a'||e.key==='A'||e.key==='ArrowLeft') return 'left'; if(e.key==='d'||e.key==='D'||e.key==='ArrowRight') return 'right'; if(e.key==='w'||e.key==='W'||e.key==='ArrowUp'||e.code==='Space') return 'jump'; return null; }

document.querySelectorAll('.mobileControls button').forEach(b=>{
  const k=b.dataset.k;
  const on=e=>{e.preventDefault(); input(k,true)}; const off=e=>{e.preventDefault(); input(k,false)};
  b.addEventListener('touchstart',on); b.addEventListener('touchend',off); b.addEventListener('touchcancel',off);
  b.addEventListener('mousedown',on); b.addEventListener('mouseup',off); b.addEventListener('mouseleave',off);
});

function draw(){
  ctx.fillStyle = '#7adb43'; ctx.fillRect(0,0,c.width,c.height);
  ctx.fillStyle = '#ffffff20'; for(let i=0;i<32;i++){ctx.beginPath();ctx.arc((i*157)%960,(i*91)%600,35,0,Math.PI*2);ctx.fill();}
  for(const p of platforms){ ctx.fillStyle = p.y>540?'#3b2817':'#b96723'; ctx.fillRect(p.x,p.y,p.w,p.h); ctx.fillStyle='#0002'; ctx.fillRect(p.x,p.y,p.w,5); }
  if(state){
    ctx.fillStyle='#fff'; ctx.strokeStyle='#111'; ctx.lineWidth=5; ctx.font='bold 46px Arial'; ctx.textAlign='center'; ctx.strokeText(String(state.time||90),480,55); ctx.fillText(String(state.time||90),480,55);
    for(const p of Object.values(state.players||{})){
      ctx.fillStyle=p.color; ctx.fillRect(p.x,p.y,p.w,p.h); ctx.strokeStyle='#111'; ctx.lineWidth=3; ctx.strokeRect(p.x,p.y,p.w,p.h);
      ctx.fillStyle='#111'; ctx.font='bold 16px Arial'; ctx.fillText(String(p.id),p.x+p.w/2,p.y+23);
      ctx.fillStyle='#fff'; ctx.strokeStyle='#111'; ctx.lineWidth=3; ctx.font='bold 14px Arial'; ctx.strokeText(p.name,p.x+p.w/2,p.y-8); ctx.fillText(p.name,p.x+p.w/2,p.y-8);
      if(p.id===state.taggerId) arrow(p.x+p.w/2,p.y-34);
    }
    if(!state.started){ box(state.message || `Room ${state.code}: waiting/start game`, Object.keys(state.players||{}).length < 2 ? 'Need 2 players to start' : 'Host presses Start'); }
    if(state.message) box(state.message, 'Press Lobby then Start to play again');
  } else box('Create or join a room', '');
  requestAnimationFrame(draw);
}
function arrow(x,y){ctx.fillStyle='#fff';ctx.strokeStyle='#111';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,y+28);ctx.lineTo(x-15,y+8);ctx.lineTo(x-5,y+8);ctx.lineTo(x-5,y-12);ctx.lineTo(x+5,y-12);ctx.lineTo(x+5,y+8);ctx.lineTo(x+15,y+8);ctx.closePath();ctx.fill();ctx.stroke();}
function box(a,b){ctx.fillStyle='#0009';ctx.fillRect(220,215,520,135);ctx.fillStyle='#fff';ctx.textAlign='center';ctx.font='bold 28px Arial';ctx.fillText(a,480,265);ctx.font='18px Arial';ctx.fillText(b,480,302);}
draw();
