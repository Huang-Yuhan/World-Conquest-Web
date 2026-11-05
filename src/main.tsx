import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MapCanvas} from './map/MapCanvas.tsx';
import {COUNTRIES,PROVINCES,countryById,provinceById} from './core/world.ts';
import {advanceTurn,createInitialGame,recruitRegiment,RECRUIT_COST,weeklyIncome} from './core/simulation.ts';
import './style.css';
const terrainLabels:Record<string,string>={plains:'平原',forest:'森林',hills:'丘陵',mountains:'山地'};
function formatDate(date:string):string {const [year,month,day]=date.split('-');return `${year}年${Number(month)}月${Number(day)}日`;}

function App(){
 const [game,setGame]=useState(createInitialGame),[selected,setSelected]=useState<string|null>('1,2'),[zoom,setZoom]=useState(0),[reset,setReset]=useState(0);
 const province=selected?provinceById(selected):undefined,country=province?countryById(province.ownerId):undefined,player=countryById(game.playerCountryId);
 const own=province?.ownerId===game.playerCountryId;
 return <div className="app">
 <header className="top"><div className="brand"><span>✦</span><div><small>战略指挥部 · 1936</small><h1>边境 <em>图志</em></h1></div></div><div className="activity">● 战役进行中 / 阿斯特里亚战区</div><div className="controls"><small>第 {game.turn} 回合</small><strong>{formatDate(game.date)}</strong><button onClick={()=>setGame(advanceTurn)}>下一周 →</button></div></header>
 <div className="layout"><aside className="panel left"><h3>所属国家</h3><div className="nation"><i style={{backgroundColor:'#'+player.color.toString(16)}}/>{player.name}</div><h3>国家概况</h3><div className="stat"><span>国库</span><b>◈ {game.treasury[game.playerCountryId]}</b></div><div className="stat"><span>每周收入</span><b>+{weeklyIncome(game.playerCountryId)}</b></div><div className="stat"><span>省份数量</span><b>{PROVINCES.filter(p=>p.ownerId===game.playerCountryId).length}</b></div><div className="stat"><span>部队数量</span><b>{PROVINCES.filter(p=>p.ownerId===game.playerCountryId).reduce((n,p)=>n+(game.regiments[p.id]??0),0)}</b></div><h3>列强概览</h3>{COUNTRIES.map(c=><div className="power" key={c.id}><i style={{backgroundColor:'#'+c.color.toString(16)}}/>{c.name}<small>{PROVINCES.filter(p=>p.ownerId===c.id).length}</small></div>)}<p className="footnote">测试版本 · 里程碑 0</p></aside>
 <main className="map"><div className="map-caption">● 政治地图 — 阿斯特里亚大陆</div><MapCanvas selectedId={selected} onSelect={setSelected} zoomCommand={zoom} resetCommand={reset} regiments={game.regiments}/><div className="map-buttons"><button title="放大地图" aria-label="放大地图" onClick={()=>setZoom(n=>n+1)}>＋</button><button title="缩小地图" aria-label="缩小地图" onClick={()=>setZoom(n=>n-1)}>−</button><button title="重置地图视角" aria-label="重置地图视角" onClick={()=>setReset(n=>n+1)}>⌖</button></div><div className="hint">拖动平移 · 滚轮缩放 · 点击查看省份</div></main>
 <aside className="panel right"><h3>省份情报</h3>{province&&country?<><div className="province"><small>省份 / {province.id}</small><h2>{province.name}</h2><p>{country.name}</p></div><h3>领土报告</h3><div className="stat"><span>地形</span><b>{terrainLabels[province.terrain]??province.terrain}</b></div><div className="stat"><span>工业</span><b>{province.industry} / 5</b></div><div className="stat"><span>Regiments</span><b>{game.regiments[province.id]??0}</b></div><div className="stat"><span>战略地位</span><b>{province.capital?'★ 首都':'普通省份'}</b></div><h3>军事指挥</h3><p className="description">{own?'可以在该省份招募部队，保卫你的国家。':'无法在其他国家的领土上招募部队。'}</p><button className="recruit" disabled={!own||game.treasury[game.playerCountryId]<RECRUIT_COST} onClick={()=>setGame(g=>recruitRegiment(g,province.id)??g)}>＋ 招募一个团 <small>◈ {RECRUIT_COST}</small></button></>:<p>点击地图上的省份以查看详细信息。</p>}<h3>战役日志</h3>{game.log.slice(0,5).map(e=><div className="entry" key={e.id}><small>{formatDate(e.date)}</small><p>{e.message}</p></div>)}</aside></div>
 <footer>边境图志 / 战略模拟 <span>架空大陆 · 战斗系统尚未开放</span> v0.1.0</footer></div>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
