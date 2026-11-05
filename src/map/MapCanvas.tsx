import {useEffect,useRef} from 'react';
import {Application,Container,Graphics,Text} from 'pixi.js';
import {COUNTRIES,PROVINCES,countryById} from '../core/world.ts';
import {MAP_WIDTH,MAP_HEIGHT,center,polygon} from './geometry.ts';
interface Props {selectedId:string|null;onSelect:(id:string)=>void;zoomCommand:number;resetCommand:number;regiments:Record<string,number>;}
export function MapCanvas({selectedId,onSelect,zoomCommand,resetCommand,regiments}:Props){
const holder=useRef<HTMLDivElement>(null),app=useRef<Application|null>(null),sceneRef=useRef<Container|null>(null);
const shapes=useRef(new Map<string,Graphics>()),armyLabels=useRef(new Map<string,Text>()),selected=useRef(selectedId),selectCallback=useRef(onSelect);
const zoomSeen=useRef(zoomCommand),resetSeen=useRef(resetCommand);selected.current=selectedId;selectCallback.current=onSelect;
useEffect(()=>{
 const host=holder.current;if(!host)return;
 const instance=new Application(),scene=new Container();let disposed=false,scale=1,px=0,py=0,drag:{x:number;y:number;px:number;py:number}|null=null,moved=false,lastDragged=0;
 const camera=()=>{scene.position.set(px,py);scene.scale.set(scale);};
 const fit=()=>{scale=Math.max(.3,Math.min(1.2,Math.min(host.clientWidth/MAP_WIDTH,host.clientHeight/MAP_HEIGHT)*1.08));px=(host.clientWidth-MAP_WIDTH*scale)/2;py=(host.clientHeight-MAP_HEIGHT*scale)/2;camera();};
 const paint=(p:typeof PROVINCES[number],g:Graphics)=>{const active=selected.current===p.id;g.clear().poly(polygon(p)).fill({color:countryById(p.ownerId).color}).stroke({width:active?5:2,color:active?0xffe4a3:0x263944});};
 const down=(e:PointerEvent)=>{if(e.button!==0)return;drag={x:e.clientX,y:e.clientY,px,py};moved=false;};
 const move=(e:PointerEvent)=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(dx,dy)>5)moved=true;if(moved){px=drag.px+dx;py=drag.py+dy;camera();}};
 const up=()=>{if(moved)lastDragged=performance.now();drag=null;};
 const wheel=(e:WheelEvent)=>{e.preventDefault();const r=host.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top,next=Math.min(3,Math.max(.3,scale*(e.deltaY<0?1.12:.89))),k=next/scale;px=x-(x-px)*k;py=y-(y-py)*k;scale=next;camera();};
 const resize=()=>fit();
 async function init(){
   await instance.init({resizeTo:host,backgroundAlpha:0,antialias:true,preference:'webgl'});
   if(disposed){instance.destroy(true,{children:true});return;}
   app.current=instance;sceneRef.current=scene;host.appendChild(instance.canvas);instance.stage.addChild(scene);
   for(const p of PROVINCES){const g=new Graphics();g.eventMode='static';g.cursor='pointer';g.on('pointertap',()=>{if(performance.now()-lastDragged>120)selectCallback.current(p.id);});g.on('pointerover',()=>{g.tint=0xf2e6d3;});g.on('pointerout',()=>{g.tint=0xffffff;});scene.addChild(g);shapes.current.set(p.id,g);paint(p,g);}
   for(const p of PROVINCES){const pos=center(p);
     if(p.capital){const icon=new Graphics().circle(pos.x,pos.y-9,7).fill(0xffd793).circle(pos.x,pos.y-9,3).fill(0x152631);icon.eventMode='none';scene.addChild(icon);}
     const name=new Text({text:p.name,anchor:.5,style:{fontFamily:'Georgia,serif',fontSize:p.capital?13:10,fill:0x263843,fontWeight:p.capital?'bold':'normal'}});name.position.set(pos.x,pos.y+11);name.eventMode='none';scene.addChild(name);
     const army=new Text({text:'',anchor:.5,style:{fontFamily:'Arial',fontSize:13,fontWeight:'bold',fill:0xffefd1}});army.position.set(pos.x,pos.y-24);army.eventMode='none';scene.addChild(army);armyLabels.current.set(p.id,army);
   }
   for(const c of COUNTRIES){const own=PROVINCES.filter(p=>p.ownerId===c.id);const x=own.reduce((v,p)=>v+center(p).x,0)/own.length,y=own.reduce((v,p)=>v+center(p).y,0)/own.length;const txt=new Text({text:c.name.toUpperCase(),anchor:.5,style:{fontFamily:'Georgia,serif',fontSize:22,fill:0x152630,fontWeight:'bold',letterSpacing:3}});txt.alpha=.48;txt.position.set(x,y-40);txt.eventMode='none';scene.addChild(txt);}
   for(const [id,label] of armyLabels.current)label.text=(regiments[id]??0)>0?'⚑ '+regiments[id]:'';
   fit();host.addEventListener('pointerdown',down);window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);host.addEventListener('wheel',wheel,{passive:false});window.addEventListener('resize',resize);
 }
 void init();
 return ()=>{disposed=true;host.removeEventListener('pointerdown',down);window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);host.removeEventListener('wheel',wheel);window.removeEventListener('resize',resize);shapes.current.clear();armyLabels.current.clear();sceneRef.current=null;if(app.current===instance){app.current=null;instance.destroy(true,{children:true});}};
},[]);
useEffect(()=>{for(const [id,g] of shapes.current){const p=PROVINCES.find(p=>p.id===id);if(!p)continue;const active=id===selectedId;g.clear().poly(polygon(p)).fill({color:countryById(p.ownerId).color}).stroke({color:active?0xffe4a3:0x263944,width:active?5:2});}},[selectedId]);
useEffect(()=>{for(const [id,label] of armyLabels.current)label.text=(regiments[id]??0)>0?'⚑ '+regiments[id]:'';},[regiments]);
useEffect(()=>{if(zoomSeen.current===zoomCommand||!sceneRef.current||!holder.current)return;zoomSeen.current=zoomCommand;const scene=sceneRef.current,h=holder.current,old=scene.scale.x,next=Math.max(.3,Math.min(3,old*(zoomCommand>0?1.2:.83))),k=next/old;scene.position.set(h.clientWidth/2-(h.clientWidth/2-scene.x)*k,h.clientHeight/2-(h.clientHeight/2-scene.y)*k);scene.scale.set(next);},[zoomCommand]);
useEffect(()=>{if(resetSeen.current===resetCommand||!sceneRef.current||!holder.current)return;resetSeen.current=resetCommand;const scene=sceneRef.current,h=holder.current,s=Math.max(.3,Math.min(1.2,Math.min(h.clientWidth/MAP_WIDTH,h.clientHeight/MAP_HEIGHT)*1.08));scene.position.set((h.clientWidth-MAP_WIDTH*s)/2,(h.clientHeight-MAP_HEIGHT*s)/2);scene.scale.set(s);},[resetCommand]);
return <div className="map-canvas" ref={holder}/>;
}
