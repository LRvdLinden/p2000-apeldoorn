// Instagram reels A-Alerts, 28-11-2026 (NL), 1080x1920, 30 fps, 16 s, no sound (add trending audio in Instagram).
// Run: node social/a-alerts-2026-11-28/bron/reels.js [meldingen|helikopters] [--frames 0,4.5,10,13]
// Every frame is the same HTML page drawn at time t; Playwright screenshots it and pipes the JPEG into ffmpeg.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const HIER = 'file://' + __dirname + '/';
const IMG = 'file://' + path.resolve(__dirname, '../../../website/assets/img') + '/';
const FONT = 'file://' + path.resolve(__dirname, '../../../website/assets/fonts') + '/';
const UIT = path.resolve(__dirname, '../nl');
const W = 1080, H = 1920, FPS = 30, DUUR = 16;

const css = `
@font-face{font-family:P;font-weight:500;src:url(${FONT}Poppins-Medium.woff2)}
@font-face{font-family:P;font-weight:600;src:url(${FONT}Poppins-SemiBold.woff2)}
@font-face{font-family:P;font-weight:700;src:url(${FONT}Poppins-Bold.woff2)}
@font-face{font-family:O;font-weight:900;src:url(${FONT}overpass-latin-900-normal.woff2)}
*{margin:0;box-sizing:border-box}
body{width:${W}px;height:${H}px;overflow:hidden;font-family:P;color:#fff;position:relative;
  background:radial-gradient(120% 90% at 20% 10%,#D2122E 0%,#B40D26 45%,#8A0A1E 100%)}
.tex{position:absolute;inset:-60px;background:url(${IMG}maptex.webp) center/cover;opacity:.16;mix-blend-mode:screen}
.strepen{position:absolute;left:0;top:0;width:330px;height:330px;clip-path:polygon(0 0,100% 0,0 100%);
  background:repeating-linear-gradient(135deg,#fff 0 26px,transparent 26px 56px)}
.a{position:absolute;will-change:transform,opacity}
.hook{left:80px;right:80px;top:560px;text-align:left}
.hook h1{font-family:O;font-weight:900;font-size:118px;line-height:1.02;letter-spacing:-1px;text-shadow:0 6px 24px rgba(0,0,0,.3)}
.hook p{font-size:50px;line-height:1.25;font-weight:600;margin-top:34px}
.kop{left:80px;right:80px;top:270px}
.kop .pill{display:inline-flex;align-items:center;gap:12px;background:rgba(0,0,0,.42);border-radius:999px;padding:10px 24px 10px 18px;font-weight:600;font-size:32px}
.pill i{width:16px;height:16px;border-radius:50%;background:#3DDC84;box-shadow:0 0 0 5px rgba(61,220,132,.25)}
.kop h2{font-family:O;font-weight:900;font-size:84px;line-height:1.02;margin-top:22px;text-shadow:0 4px 18px rgba(0,0,0,.25)}
.kop p{font-size:36px;font-weight:500;line-height:1.3;margin-top:16px}
.toestel{left:230px;width:620px;filter:drop-shadow(0 34px 60px rgba(0,0,0,.5))}
.melding{left:70px;width:940px;display:flex;gap:22px;align-items:center;padding:24px 28px;border-radius:38px;
  background:rgba(250,250,252,.94);color:#111;box-shadow:0 20px 50px rgba(0,0,0,.35)}
.melding .ic{width:92px;height:92px;border-radius:22px;background:#fff;display:grid;place-items:center;flex:none;box-shadow:0 2px 8px rgba(0,0,0,.12)}
.melding .ic img{width:76%;height:76%;object-fit:contain}
.melding b{display:block;font-size:34px;font-weight:700;line-height:1.15}
.melding span{display:block;font-size:30px;font-weight:500;color:#333;margin-top:4px;line-height:1.2}
.melding .tijd{position:absolute;right:30px;top:22px;font-size:24px;color:#777;font-weight:500}
.melding .app{font-size:24px;color:#777;font-weight:600;letter-spacing:.5px;text-transform:uppercase;margin-bottom:4px}
.iconen{left:80px;right:80px;display:flex;gap:22px;flex-wrap:wrap}
.iconen span{width:150px;height:150px;border-radius:36px;background:#fff;display:grid;place-items:center;box-shadow:0 10px 26px rgba(0,0,0,.3)}
.iconen span img{width:72%;height:72%;object-fit:contain}
.iconen.label span{flex-direction:column;gap:0}
.cta{left:0;right:0;top:500px;text-align:center}
.cta .logo{width:300px;height:300px;border-radius:68px;box-shadow:0 30px 70px rgba(0,0,0,.45)}
.cta h1{font-family:O;font-weight:900;font-size:130px;margin-top:40px;letter-spacing:-1px}
.cta p{font-size:42px;font-weight:600;margin-top:10px;padding:0 90px;line-height:1.3}
.cta .url{display:inline-flex;align-items:center;background:rgba(0,0,0,.5);border-radius:999px;padding:18px 50px;font-family:O;font-weight:900;font-size:64px;margin-top:44px}
.cta .gratis{font-size:32px;font-weight:500;margin-top:30px;padding:0 120px;line-height:1.35;opacity:.95}
.heli{width:420px;filter:drop-shadow(0 18px 24px rgba(0,0,0,.4))}
.spoor{left:0;top:0;width:${W}px;height:${H}px}
`;

const melding = (icoon, app, kop, tekst) => `<div class="ic"><img src="${IMG}${icoon}.png"></div>
  <div><div class="app">A-Alerts</div><b>${kop}</b><span>${tekst}</span></div><div class="tijd">nu</div>`;

const CTA = `<div class="a cta" id="cta"><img class="logo" src="${IMG}aalerts-icon-512.png"><h1>A-Alerts</h1>
  <p>Alles wat er gebeurt in de gemeente Apeldoorn</p><div class="url">a-alerts.nl</div>
  <div class="gratis">Gratis voor iPhone, iPad, Mac, Apple Watch, Apple TV en Android</div></div>`;

// Shared helpers inside the page: k(t,a,b) = eased progress 0..1 between a and b; pop = overshoot.
const HELPERS = `
const cl=(x)=>Math.max(0,Math.min(1,x));
const eo=(x)=>1-Math.pow(1-x,3);
const k=(t,a,b)=>eo(cl((t-a)/(b-a)));
const pop=(t,a,b)=>{const x=cl((t-a)/(b-a));if(x>=1)return 1;const c=1.70158*1.3;return 1+(c+1)*Math.pow(x-1,3)+c*Math.pow(x-1,2);};
const $=(id)=>document.getElementById(id);
const set=(id,o,x,y,s)=>{const e=$(id);e.style.opacity=o;e.style.transform='translate('+(x||0)+'px,'+(y||0)+'px) scale('+(s==null?1:s)+')';};
const uit=(t,a,b)=>1-k(t,a,b);
`;

const REELS = {
  meldingen: {
    html: `
<div class="a hook" id="hook"><h1 id="h1">Sirenes in<br>je straat?</h1><p id="h2">Weet binnen seconden wat er aan de hand is.</p></div>
<img class="a toestel" id="tel" src="${HIER}toestel-p2000.png" style="top:780px">
<div class="a kop" id="kop1"><span class="pill"><i></i>Live · elke melding</span><h2>Direct een push</h2></div>
<div class="a melding" id="m3" style="top:640px">${melding('icon_politie', '', 'Politie · Aanrijding letsel', 'Europaweg, Apeldoorn')}</div>
<div class="a melding" id="m2" style="top:640px">${melding('icon_brandweer', '', 'Brandweer · Brandmelding', 'Woning, Apeldoorn-Zuid')}</div>
<div class="a melding" id="m1" style="top:640px">${melding('icon_ambulance', '', 'Ambulance · A1 spoed', 'Apeldoorn-Centrum')}</div>
<div class="a kop" id="kop2"><span class="pill"><i></i>Gemeente Apeldoorn</span><h2>Brandweer, ambulance,<br>politie en traumaheli</h2></div>
<div class="a iconen" id="ic" style="top:690px">
  <span id="i0"><img src="${IMG}icon_brandweer.png"></span><span id="i1"><img src="${IMG}icon_ambulance.png"></span>
  <span id="i2"><img src="${IMG}icon_politie.png"></span><span id="i3"><img src="${IMG}icon_traumaheli.png"></span></div>
${CTA}`,
    render: `
function render(t){
  // Hook 0-3.3 s
  const ho=uit(t,3.0,3.5);
  set('h1',k(t,.1,.5)*ho,0,(1-pop(t,.1,.6))*80-k(t,3.0,3.5)*120,.9+.1*pop(t,.1,.6));
  set('h2',k(t,.9,1.4)*ho,0,(1-k(t,.9,1.4))*50-k(t,3.0,3.5)*120);
  // Phone rises 3.1-4.1, drifts, leaves 11.6-12.2
  const telY=(1-k(t,3.1,4.1))*1200 - (t-3.1>0?Math.min(t-3.1,8.5)*8:0) + k(t,8.7,9.4)*230 + k(t,11.6,12.2)*1300;
  set('tel',t<3.05?0:1,0,telY,1);
  // Heading 1 3.6-8.9
  set('kop1',k(t,3.6,4.1)*uit(t,8.6,9.0),0,(1-k(t,3.6,4.1))*-40);
  // Push banners drop in, the newest stays on top and pushes the others down (iOS-like)
  const in1=4.3,in2=5.5,in3=6.7, weg=uit(t,8.6,9.0);
  const zak=(a)=>k(t,a,a+.45)*190;
  set('m3',k(t,in1,in1+.25)*weg,0,-260*(1-pop(t,in1,in1+.6))+zak(in2)+zak(in3),1);
  set('m2',k(t,in2,in2+.25)*weg,0,-260*(1-pop(t,in2,in2+.6))+zak(in3),1);
  set('m1',k(t,in3,in3+.25)*weg,0,-260*(1-pop(t,in3,in3+.6)),1);
  // Heading 2 with icons 9.0-11.8
  const w2=uit(t,11.4,11.9);
  set('kop2',k(t,9.0,9.5)*w2,0,(1-k(t,9.0,9.5))*-40);
  set('ic',w2,0,0);
  for(let i=0;i<4;i++){const a=9.4+i*.22; set('i'+i,k(t,a,a+.2),0,0,.3+.7*pop(t,a,a+.5));}
  // CTA 12-16
  set('cta',k(t,12.0,12.5),0,(1-pop(t,12.0,12.7))*120,.85+.15*pop(t,12.0,12.7));
  document.querySelector('.tex').style.transform='translate('+(-t*3)+'px,'+(-t*2)+'px)';
}`,
  },
  helikopters: {
    html: `
<svg class="a spoor" id="spoor" viewBox="0 0 ${W} ${H}"><path id="pad" d="M1300 520 C 1000 440, 760 600, 480 500 S 0 420, -420 480" fill="none" stroke="none"/><g id="stip"></g></svg>
<img class="a heli" id="heli" src="${IMG}heli_lifeliner.png" style="left:0;top:0">
<div class="a hook" id="hook" style="top:720px"><h1 id="h1">Lifeliner<br>boven je huis?</h1><p id="h2">Zie live waar hij landt en heen vliegt.</p></div>
<img class="a toestel" id="tel" src="${HIER}toestel-heli.png" style="top:780px">
<img class="a toestel" id="tel2" src="${HIER}toestel-waarschuwing.png" style="top:780px">
<div class="a kop" id="kop1"><span class="pill"><i></i>Live op de kaart</span><h2>Volg helikopters live</h2><p>Positie, route van 2 uur en het verwachte ziekenhuis.</p></div>
<div class="a kop" id="kop2"><span class="pill"><i></i>Direct een melding</span><h2>Alle waarschuwingen<br>op één plek</h2></div>
<div class="a iconen" id="ic" style="top:620px;gap:18px">
  <span id="i0" style="width:166px;height:166px"><img src="${IMG}icon_nlalert.png"></span><span id="i1" style="width:166px;height:166px"><img src="${IMG}icon_burgernet.png"></span>
  <span id="i2" style="width:166px;height:166px"><img src="${IMG}icon_amber.png"></span><span id="i3" style="width:166px;height:166px"><img src="${IMG}icon_vermistkind.png"></span>
  <span id="i4" style="width:166px;height:166px"><img src="${IMG}icon_knmi.png"></span></div>
${CTA}`,
    render: `
const PAD=document.getElementById('pad'), LEN=PAD.getTotalLength();
function render(t){
  // Heli flies along the path 0-3.4 s, leaving a dotted trail
  const f=cl(t/3.4), pnt=PAD.getPointAtLength(LEN*f), vo=PAD.getPointAtLength(Math.max(0,LEN*f-4));
  const hw=uit(t,3.1,3.5);
  const e=$('heli'); e.style.opacity=hw; e.style.transform='translate('+(pnt.x-210)+'px,'+(pnt.y-75+Math.sin(t*6)*6)+'px) rotate('+(-Math.atan2(pnt.y-vo.y,vo.x-pnt.x)*180/Math.PI*.6)+'deg) scaleX(-1)';
  $('spoor').style.opacity=hw;
  const g=$('stip'); let h=''; for(let d=0; d<LEN*f-140; d+=30){const q=PAD.getPointAtLength(d); h+='<circle cx="'+q.x+'" cy="'+q.y+'" r="6" fill="#FFD400"/>';} g.innerHTML=h;
  const ho=uit(t,3.0,3.5);
  set('h1',k(t,.3,.7)*ho,0,(1-pop(t,.3,.8))*80-k(t,3.0,3.5)*120,.9+.1*pop(t,.3,.8));
  set('h2',k(t,1.1,1.6)*ho,0,(1-k(t,1.1,1.6))*50-k(t,3.0,3.5)*120);
  // Phone heli 3.1-8.2, then waarschuwingen phone slides in
  const drift=(t-3.1>0?Math.min(t-3.1,8.5)*8:0);
  set('tel',(t<3.05?0:1)*uit(t,7.9,8.3),-k(t,7.9,8.4)*900,(1-k(t,3.1,4.1))*1200-drift,1);
  set('tel2',t<7.9?0:1,(1-k(t,7.9,8.4))*900,-drift+170+k(t,11.6,12.2)*1300,1);
  set('kop1',k(t,3.6,4.1)*uit(t,7.7,8.1),0,(1-k(t,3.6,4.1))*-40);
  const w2=uit(t,11.4,11.9);
  set('kop2',k(t,8.2,8.7)*w2,0,(1-k(t,8.2,8.7))*-40);
  set('ic',w2,0,0);
  for(let i=0;i<5;i++){const a=8.7+i*.22; set('i'+i,k(t,a,a+.2),0,0,.3+.7*pop(t,a,a+.5));}
  set('cta',k(t,12.0,12.5),0,(1-pop(t,12.0,12.7))*120,.85+.15*pop(t,12.0,12.7));
  document.querySelector('.tex').style.transform='translate('+(-t*3)+'px,'+(-t*2)+'px)';
}`,
  },
};

const pagina = (r) => `<!doctype html><meta charset="utf-8"><style>${css}</style>
<div class="tex"></div><div class="strepen"></div>${r.html}
<script>${HELPERS}${r.render}
Promise.all([document.fonts.ready,...[...document.images].map(i=>i.decode().catch(()=>{}))]).then(()=>{render(0);document.body.dataset.klaar='1'});</script>`;

(async () => {
  const args = process.argv.slice(2);
  const namen = args.filter((a) => REELS[a]);
  const fi = args.indexOf('--frames');
  const losse = fi >= 0 ? args[fi + 1].split(',').map(Number) : null;
  const br = await chromium.launch();
  for (const naam of namen.length ? namen : Object.keys(REELS)) {
    const tmp = path.join(__dirname, `_${naam}.html`);
    fs.writeFileSync(tmp, pagina(REELS[naam]));
    const p = await br.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    await p.goto('file://' + tmp, { waitUntil: 'load' });
    await p.waitForSelector('body[data-klaar]');
    if (losse) {
      for (const t of losse) { await p.evaluate((t) => render(t), t); await p.screenshot({ path: path.join(process.env.CHECK || __dirname, `check-${naam}-${t}.jpg`), type: 'jpeg', quality: 80 }); }
    } else {
      const doel = path.join(UIT, `reel-${naam}-1080x1920.mp4`), bezig = doel.replace(/\.mp4$/, '.bezig.mp4');
      const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
        '-c:v', 'libx264', '-crf', '18', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', bezig], { stdio: ['pipe', 'inherit', 'inherit'] });
      const klaar = new Promise((ok, nee) => ff.on('close', (c) => (c === 0 ? ok() : nee(new Error('ffmpeg ' + c)))));
      for (let i = 0; i < FPS * DUUR; i++) {
        await p.evaluate((t) => render(t), i / FPS);
        const buf = await p.screenshot({ type: 'jpeg', quality: 92 });
        if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
      }
      ff.stdin.end(); await klaar; fs.renameSync(bezig, doel); console.log('klaar:', doel);
    }
    await p.close(); fs.rmSync(tmp, { force: true });
  }
  await br.close();
})();
