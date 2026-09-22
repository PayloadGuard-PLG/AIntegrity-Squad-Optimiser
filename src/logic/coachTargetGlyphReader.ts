import type { RgbaImage } from './glyphReader';
import type { OcrResult, OcrFrame } from './playerCardParse';
import { OUTFIELD_STATS, GK_STATS } from '../utils/roleWeights';

const ALL_STATS = [...OUTFIELD_STATS, ...GK_STATS] as string[];
const STATS_BY_LENGTH = [...ALL_STATS].sort((a,b)=>b.length-a.length);
const CORRECTIONS: Record<string,string> = {
  ANTICIPATIO:'ANTICIPATION',
  ANTICIPAT1ON:'ANTICIPATION',
  CONCENTRAT1ON:'CONCENTRATION',
  COMMUNICAT1ON:'COMMUNICATION',
};

type StatRow = { stat:string; frame:OcrFrame };

function canonical(raw:string):string {
  let s=raw.toUpperCase().trim();
  for(const [bad,good] of Object.entries(CORRECTIONS)) s=s.replace(new RegExp(`\\b${bad}\\b`,'g'),good);
  return s;
}
function statFromLine(text:string):string|undefined {
  const c=canonical(text);
  return STATS_BY_LENGTH.find(stat => c===stat || c.startsWith(`${stat} `));
}
function median(values:number[]):number {
  if(!values.length) return 0;
  const a=[...values].sort((x,y)=>x-y);
  const m=Math.floor(a.length/2);
  return a.length%2?a[m]:(a[m-1]+a[m])/2;
}
function percentile(values:number[], q:number):number {
  if(!values.length) return 0;
  const a=[...values].sort((x,y)=>x-y);
  const i=Math.max(0,Math.min(a.length-1,Math.floor((a.length-1)*q)));
  return a[i];
}
function luminance(r:number,g:number,b:number):number {
  return .2126*r+.7152*g+.0722*b;
}
function rowScore(image:RgbaImage,row:StatRow,columnStep:number,rowStep:number):number {
  const x0=Math.max(0,Math.floor(row.frame.left+columnStep*.76));
  const x1=Math.min(image.width,Math.ceil(row.frame.left+columnStep*.98));
  const yc=row.frame.top+row.frame.height/2;
  const y0=Math.max(0,Math.floor(yc-rowStep*.34));
  const y1=Math.min(image.height,Math.ceil(yc+rowStep*.34));
  if(x1<=x0||y1<=y0) return 0;
  const l:number[]=[];
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++) {
    const i=(y*image.width+x)*4;
    l.push(luminance(Number(image.data[i]),Number(image.data[i+1]),Number(image.data[i+2])));
  }
  return Math.max(0,percentile(l,.985)-median(l));
}

function geometry(rows:StatRow[]):{columnStep:number;rowStep:number}|null {
  if(rows.length<3) return null;
  const heights=rows.map(r=>r.frame.height).filter(n=>n>0);
  const h=median(heights);
  if(!h) return null;

  const horizontal:number[]=[];
  for(let i=0;i<rows.length;i++) for(let j=i+1;j<rows.length;j++) {
    const a=rows[i].frame,b=rows[j].frame;
    const dy=Math.abs((a.top+a.height/2)-(b.top+b.height/2));
    const dx=Math.abs(a.left-b.left);
    if(dy<=h*1.4 && dx>=h*4) horizontal.push(dx);
  }
  horizontal.sort((a,b)=>a-b);
  const near=horizontal.slice(0,Math.max(1,Math.ceil(horizontal.length/2)));
  const columnStep=median(near);

  const vertical:number[]=[];
  const byLeft=[...rows].sort((a,b)=>a.frame.left-b.frame.left);
  for(const row of rows) {
    const peers=byLeft.filter(r=>r!==row && Math.abs(r.frame.left-row.frame.left)<=h*2.5);
    const diffs=peers.map(r=>Math.abs(r.frame.top-row.frame.top)).filter(d=>d>=h*1.25);
    if(diffs.length) vertical.push(Math.min(...diffs));
  }
  const rowStep=median(vertical);
  if(!Number.isFinite(columnStep)||columnStep<=h*4||!Number.isFinite(rowStep)||rowStep<=h) return null;
  return {columnStep,rowStep};
}

/**
 * Detect arrow-only coach target rows that ML Kit cannot represent as text.
 *
 * Targets are inferred only from a clearly separated high-contrast glyph cluster
 * anchored to OCR stat rows. Coach type/category is never used as target evidence.
 * Ambiguous images return [] so the UI can require manual confirmation.
 */
export function detectCoachArrowTargets(result:OcrResult,image:RgbaImage):string[] {
  const rows:StatRow[]=[];
  for(const block of result.blocks??[]) for(const line of block.lines??[]) {
    const stat=statFromLine(line.text??'');
    if(stat && line.frame) rows.push({stat,frame:line.frame});
  }
  const unique=[...new Map(rows.map(r=>[r.stat,r])).values()];
  const g=geometry(unique);
  if(!g) return [];

  const scored=unique.map(row=>({row,score:rowScore(image,row,g.columnStep,g.rowStep)}))
    .sort((a,b)=>a.score-b.score);
  if(scored.length<3) return [];

  let split=-1,largestGap=-Infinity;
  for(let i=0;i<scored.length-1;i++) {
    const gap=scored[i+1].score-scored[i].score;
    if(gap>largestGap){largestGap=gap;split=i;}
  }
  if(split<0||split>=scored.length-1) return [];

  const lower=scored.slice(0,split+1).map(x=>x.score);
  const upper=scored.slice(split+1).map(x=>x.score);
  const lowerMedian=median(lower), upperMedian=median(upper);
  const overallRange=scored[scored.length-1].score-scored[0].score;

  if(overallRange<=0 || largestGap<overallRange*.45 || upperMedian<Math.max(1,lowerMedian)*2.5) return [];
  return scored.slice(split+1).map(x=>x.row.stat);
}
