import type {Province} from '../core/world.ts';
export interface Point {x:number;y:number;}
export const MAP_WIDTH=1320, MAP_HEIGHT=790;
const CW=110,CH=112,X0=110,Y0=66;
function noise(x:number,y:number):number {const a=Math.sin(x*127.1+y*311.7)*43758.5453;return (a-Math.floor(a))*2-1;}
function corner(x:number,y:number):Point {return {x:X0+x*CW+noise(x,y)*12,y:Y0+y*CH+noise(y+23,x+11)*13};}
function between(a:Point,b:Point):Point {const len=Math.hypot(b.x-a.x,b.y-a.y)||1,offset=Math.sin((a.x+b.x+a.y+b.y)*.13)*9;return {x:(a.x+b.x)/2-(b.y-a.y)/len*offset,y:(a.y+b.y)/2+(b.x-a.x)/len*offset};}
export function polygon(p:Province):Point[] {const a=corner(p.col,p.row),b=corner(p.col+1,p.row),c=corner(p.col+1,p.row+1),d=corner(p.col,p.row+1);return [a,between(a,b),b,between(b,c),c,between(d,c),d,between(a,d)];}
export function center(p:Province):Point {const points=polygon(p);return {x:points.reduce((n,p)=>n+p.x,0)/points.length,y:points.reduce((n,p)=>n+p.y,0)/points.length};}
