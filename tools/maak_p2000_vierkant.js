// Square banners (1200x1200) for the P2000 Homey app (nl.lrvdlinden.p2000, all of the Netherlands) in the A-Alerts style:
// banners/p2000_<dienst>.png in LRvdLinden/P2000-brand (same names as before). Usage: node tools/maak_p2000_vierkant.js <out-dir> <App_icon.jpg>
const path=require('path');
const T=__dirname+'/';
const { page, stripes, IMG } = require(T+'maak_nieuws_banners.js');
const { chromium } = require('playwright');
const fs=require('fs'); const OUT=path.resolve(process.argv[2]||'.'); const ICON=path.resolve(process.argv[3]||OUT+'/App_icon.jpg');
const NL='heel Nederland';
const pill=(i)=>`<img src="${IMG}${i}" style="border-radius:12px">`;
// Own drawing: lifebuoy for the Kustwacht (no logo).
const boei=`<svg viewBox="0 0 200 200" width="190"><circle cx="100" cy="100" r="80" fill="#fff" stroke="#0A2F6B" stroke-width="6"/><circle cx="100" cy="100" r="38" fill="#0A2F6B"/><g fill="#F26B1D"><path d="M100 20a80 80 0 0 1 56.6 23.4L127 73a38 38 0 0 0-27-11z"/><path d="M180 100a80 80 0 0 1-23.4 56.6L127 127a38 38 0 0 0 11-27z"/><path d="M100 180a80 80 0 0 1-56.6-23.4L73 127a38 38 0 0 0 27 11z"/><path d="M20 100a80 80 0 0 1 23.4-56.6L73 73a38 38 0 0 0-11 27z"/></g><circle cx="100" cy="100" r="38" fill="none" stroke="#0A2F6B" stroke-width="6"/></svg>`;
const B=[
 { name:"p2000_ambu", bg:'linear-gradient(135deg,#FFD21F,#F2B705)', stripes:stripes('#0A4DA2','transparent',30), ringColor:'#0A4DA2', tile:`<img src="${IMG}icon_ambulance.png" style="width:170px">`, tileBg:'#0A4DA2', pillIcon:pill('icon_ambulance.png'), pill:'P2000-melding', big:'Ambulance', bigColor:'#0B1F3F', sub:NL, subColor:'#0B1F3F' },
 { name:"p2000_brand", bg:'linear-gradient(135deg,#B0001A,#E3001B)', stripes:stripes('#fff','transparent',30), stripeOpacity:.9, tile:`<img src="${IMG}icon_brandweer.png" style="width:170px">`, tileBg:'#fff', pillIcon:pill('icon_brandweer.png'), pill:'P2000-melding', big:'Brandweer', bigColor:'#fff', sub:NL, subColor:'#fff' },
 { name:"p2000_pol", bg:'linear-gradient(135deg,#0A2459,#163E8C)', stripes:stripes('#fff','#E3001B',30), stripeOpacity:.9, tile:`<img src="${IMG}icon_politie.png" style="width:170px">`, tileBg:'#fff', pillIcon:pill('icon_politie.png'), pill:'P2000-melding', big:'Politie', bigColor:'#fff', sub:NL, subColor:'#fff' },
 { name:"p2000_kust", bg:'linear-gradient(135deg,#0A2F6B,#1656A8)', stripes:stripes('#F26B1D','#fff',30), stripeOpacity:.9, ringColor:'#F26B1D', tile:boei, tileBg:'#fff', pillIcon:boei.replace('width="190"','width="46"'), pill:'P2000-melding', big:'Kustwacht', bigColor:'#fff', sub:NL, subColor:'#fff' },
 { name:"p2000_life", bg:'linear-gradient(135deg,#5B1A9E,#8B2BE2)', stripes:stripes('#FFD21F','transparent',30), stripeOpacity:.95, ringColor:'#FFD21F', tile:`<img src="${IMG}heli_lifeliner.png" style="width:240px">`, tileBg:'#fff', pillIcon:pill('icon_traumaheli.png'), pill:'Traumaheli', big:'Lifeliner', bigColor:'#fff', sub:NL, subColor:'#fff' },
].map(b=>({...b,h:1200,vierkant:true,tx:295,ty:300,bigTop:690,bigSize:114,subOffset:128}));
(async()=>{const br=await chromium.launch();const p=await br.newPage({viewport:{width:1200,height:1200}});
for(const b of B){let h=page(b).replace(/<div class="site">.*?<\/div>/,`<div class="site"><img src="file://${ICON}">P2000</div>`);
 fs.writeFileSync(`${OUT}/${b.name}.html`,h);await p.goto(`file://${OUT}/${b.name}.html`);await p.evaluate(()=>document.fonts.ready);await p.screenshot({path:`${OUT}/${b.name}.png`});}
await br.close();})();
