import { test } from "node:test";
import assert from "node:assert/strict";
import { luchtSoort, luchtLijst } from "../src/lucht.js";
import { retainAircraft } from "../src/heli.js";

const time = Date.parse("2026-11-18T09:55:39Z");
const phSar = {hex:"486449",r:"PH-SAR",flight:"NCG06   ",t:"A189",category:"A7",
  lat:53.133002,lon:4.617651,seen_pos:0.548,gs:125,track:181,alt_baro:850};
const earlier = (ago=2*60_000)=>({id:"lucht-486449",naam:"Kustwacht PH-SAR",soort:"kustwacht",
  icoon:"kustwacht_aw189",lat:53.13,lon:4.62,registratie:"PH-SAR",callsign:"NCG06",
  gezien:new Date(time-ago).toISOString(),op_grond:false});

test("PH-SAR NCG06 broadcast is a coastguard AW189, not filtered out",()=>{
  const kind=luchtSoort(phSar);
  assert.deepEqual(kind,{soort:"kustwacht",icoon:"kustwacht_aw189",naam:"Kustwacht PH-SAR"});
  const [h]=luchtLijst([phSar],time);
  assert.equal(h.id,"lucht-486449");
  assert.equal(h.callsign,"NCG06");
  assert.equal(h.naam,"Kustwacht PH-SAR");
  assert.equal(h.lat,53.133002);
});

test("PH-SAR still recognized by stable ICAO hex if ADS-B omits its registration and callsign",()=>{
  const kind=luchtSoort({...phSar,r:"",flight:""});
  assert.equal(kind.naam,"Kustwacht PH-SAR");
  assert.equal(kind.icoon,"kustwacht_aw189");
});

test("Coastguard flights offshore remain visible; unrelated foreign aircraft stay outside",()=>{
  const sea={...phSar,lat:55.1,lon:2.2};
  assert.equal(luchtLijst([sea],time).length,1);
  assert.equal(luchtLijst([{...sea,hex:"3f12ab",r:"D-123",flight:"",t:"H47",dbFlags:1}],time).length,0);
});

test("An empty or intermittent ADS-B snapshot retains PH-SAR with a stale label",()=>{
  const previous=[earlier()];
  const current=retainAircraft([],previous,time);
  assert.equal(current.length,1);
  assert.equal(current[0].verouderd,true);
  assert.equal(current[0].gezien,previous[0].gezien);
  assert.equal(current[0].lat,previous[0].lat);
});

test("Real new fix takes precedence over old retained stale one",()=>{
  const current=[{...earlier(10_000),lat:53.14,lon:4.61,verouderd:false}];
  const saved=[earlier()];
  const [h]=retainAircraft(current,saved,time);
  assert.equal(h.lat,53.14);
  assert.equal(h.verouderd,false);
  assert.equal(h.gezien,current[0].gezien);
});

test("No indefinite fake live tracks: last-seen points expire after twenty minutes",()=>{
  assert.equal(retainAircraft([], [earlier(22*60_000)], time).length,0);
  assert.equal(retainAircraft([earlier(22*60_000)], [], time).length,0);
});
