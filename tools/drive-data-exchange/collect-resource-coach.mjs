import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { collectResourceCoachSheet } from './collect-resource-coach-sheet.mjs';

const DRIVE_SCOPE='https://www.googleapis.com/auth/drive';
const TOKEN_AUD='https://oauth2.googleapis.com/token';

function base64url(input){
  const b=Buffer.isBuffer(input)?input:Buffer.from(String(input));
  return b.toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
}
function parseServiceAccount(raw){
  if(!raw) throw new Error('GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON secret is missing.');
  let doc;
  try{doc=JSON.parse(raw);}catch{throw new Error('GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON is not valid JSON.');}
  for(const k of ['client_email','private_key']) if(!doc[k]) throw new Error(`Service account JSON missing ${k}.`);
  return doc;
}
function signAssertion(sa, now=Math.floor(Date.now()/1000), scope=DRIVE_SCOPE){
  const header=base64url(JSON.stringify({alg:'RS256',typ:'JWT'}));
  const payload=base64url(JSON.stringify({
    iss:sa.client_email,
    scope,
    aud:sa.token_uri||TOKEN_AUD,
    iat:now-30,
    exp:now+3600,
  }));
  const body=`${header}.${payload}`;
  const sig=crypto.sign('RSA-SHA256',Buffer.from(body),sa.private_key);
  return `${body}.${base64url(sig)}`;
}
async function tokenFor(sa, scope=DRIVE_SCOPE){
  const assertion=signAssertion(sa,Math.floor(Date.now()/1000),scope);
  const res=await fetch(sa.token_uri||TOKEN_AUD,{
    method:'POST',
    headers:{'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({
      grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const text=await res.text();
  if(!res.ok) throw new Error(`Google OAuth token exchange failed (${res.status}): ${text.slice(0,500)}`);
  const json=JSON.parse(text);
  if(!json.access_token) throw new Error('Google OAuth response did not include access_token.');
  return json.access_token;
}
async function driveJson(token,url,options={}){
  const res=await fetch(url,{...options,headers:{authorization:`Bearer ${token}`,...(options.headers||{})}});
  const text=await res.text();
  if(!res.ok) throw new Error(`Drive API failed (${res.status}): ${text.slice(0,700)}`);
  return text?JSON.parse(text):{};
}
async function listFolder(token,folderId){
  const out=[];
  let pageToken='';
  do{
    const p=new URLSearchParams({
      q:`'${folderId}' in parents and trashed=false`,
      fields:'nextPageToken,files(id,name,mimeType,size,md5Checksum,createdTime,modifiedTime,webViewLink)',
      pageSize:'1000',
      orderBy:'createdTime,name',
    });
    if(pageToken)p.set('pageToken',pageToken);
    const j=await driveJson(token,`https://www.googleapis.com/drive/v3/files?${p}`);
    out.push(...(j.files||[]));
    pageToken=j.nextPageToken||'';
  }while(pageToken);
  return out;
}
async function downloadFile(token,id){
  const res=await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`,{
    headers:{authorization:`Bearer ${token}`}
  });
  if(!res.ok){
    const text=await res.text();
    throw new Error(`Drive download failed (${res.status}): ${text.slice(0,500)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}
async function uploadJson(token,folderId,name,obj){
  const boundary='aintegrity_'+crypto.randomBytes(8).toString('hex');
  const metadata={name,mimeType:'application/json',parents:[folderId]};
  const payload=Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(obj,null,2)}\r\n`),
    Buffer.from(`--${boundary}--\r\n`),
  ]);
  return driveJson(token,'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,md5Checksum',{
    method:'POST',
    headers:{'content-type':`multipart/related; boundary=${boundary}`},
    body:payload,
  });
}
function safeName(v){return String(v||'file').replace(/[^a-zA-Z0-9._-]+/g,'_').slice(0,180);}
function sha256(bytes){return crypto.createHash('sha256').update(bytes).digest('hex');}
function extension(name){return path.extname(String(name||'')).toLowerCase();}
function classifyFile(file,config){
  if(file.mimeType==='application/vnd.google-apps.folder') return 'FOLDER';
  const ext=extension(file.name);
  if(!config.collection.rawEvidenceExtensions.includes(ext)) return 'UNSUPPORTED';
  if(ext==='.json') return 'JSON';
  return 'RAW_EVIDENCE';
}
function copyRunLog(src,dest){
  fs.mkdirSync(dest,{recursive:true});
  if(!fs.existsSync(src))return;
  for(const ent of fs.readdirSync(src,{withFileTypes:true})){
    if(ent.isFile()&&ent.name.endsWith('.json')) fs.copyFileSync(path.join(src,ent.name),path.join(dest,ent.name));
  }
}
function runNode(script,args,{cwd=process.cwd()}={}){
  return execFileSync(process.execPath,[script,...args],{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']});
}
function parseArgs(argv){
  const out={};
  for(let i=0;i<argv.length;i++){
    if(argv[i].startsWith('--'))out[argv[i].slice(2)]=argv[++i];
  }
  return out;
}

export {DRIVE_SCOPE,base64url,parseServiceAccount,signAssertion,tokenFor,classifyFile,safeName,sha256};

async function main(){
  const args=parseArgs(process.argv.slice(2));
  const configPath=path.resolve(args.config||'calibration/drive-data-exchange.json');
  const outDir=path.resolve(args['out-dir']||'/tmp/drive-data-collection');
  const sourceRuns=path.resolve(args['runs-dir']||'calibration/resource-coach-log/runs');
  const corpusDir=path.resolve(args['corpus-dir']||'calibration/longitudinal-corpus');
  const ingestScript=path.resolve('tools/resource-coach-v2/ingest-experiment.mjs');
  const analyseScript=path.resolve('tools/resource-coach-v2/analyse-longitudinal-corpus.mjs');
  const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
  const sa=parseServiceAccount(process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON);
  if(config.serviceAccountEmail&&sa.client_email!==config.serviceAccountEmail){
    throw new Error(`Service account identity mismatch: expected ${config.serviceAccountEmail}, got ${sa.client_email}`);
  }

  fs.rmSync(outDir,{recursive:true,force:true});
  const rawDir=path.join(outDir,'raw');
  const stagedRuns=path.join(outDir,'runs');
  const analysisDir=path.join(outDir,'analysis');
  fs.mkdirSync(rawDir,{recursive:true});
  copyRunLog(sourceRuns,stagedRuns);

  const token=await tokenFor(sa);
  const files=await listFolder(token,config.folders.incoming);
  if(files.length>config.collection.maxFilesPerRun) throw new Error(`Incoming folder contains ${files.length} files; limit is ${config.collection.maxFilesPerRun}.`);

  const records=[];
  let totalBytes=0,newExperiments=0,alreadyPresent=0,rejected=0,rawEvidence=0,unsupported=0;
  for(const file of files){
    const kind=classifyFile(file,config);
    const row={
      drive_file_id:file.id,
      drive_name:file.name,
      drive_mime_type:file.mimeType,
      drive_size:file.size?Number(file.size):null,
      drive_md5:file.md5Checksum||null,
      drive_created_at:file.createdTime||null,
      drive_modified_at:file.modifiedTime||null,
      drive_web_url:file.webViewLink||null,
      classification:kind,
      status:null,
      sha256:null,
      experiment_id:null,
      detail:null,
    };
    if(kind==='FOLDER'||kind==='UNSUPPORTED'){
      row.status='INVENTORIED_NOT_COLLECTED';
      unsupported++;
      records.push(row);
      continue;
    }
    const advertised=Number(file.size||0);
    if(advertised>config.collection.maxFileBytes){
      row.status='REJECTED_SIZE_LIMIT'; row.detail=`file exceeds ${config.collection.maxFileBytes} bytes`; rejected++; records.push(row); continue;
    }
    let bytes;
    try{bytes=await downloadFile(token,file.id);}catch(e){row.status='REJECTED_DOWNLOAD_ERROR';row.detail=String(e.message||e).slice(0,500);rejected++;records.push(row);continue;}
    if(bytes.length>config.collection.maxFileBytes){
      row.status='REJECTED_SIZE_LIMIT'; row.detail=`downloaded bytes exceed ${config.collection.maxFileBytes}`; rejected++; records.push(row); continue;
    }
    totalBytes+=bytes.length;
    row.sha256=sha256(bytes);
    const rawPath=path.join(rawDir,`${safeName(file.id)}__${safeName(file.name)}`);
    fs.writeFileSync(rawPath,bytes);

    if(kind==='RAW_EVIDENCE'){
      row.status='STAGED_RAW_EVIDENCE_NEEDS_EXTRACTOR';
      rawEvidence++; records.push(row); continue;
    }

    let doc;
    try{doc=JSON.parse(bytes.toString('utf8'));}catch(e){
      row.status='REJECTED_INVALID_JSON'; row.detail=String(e.message||e).slice(0,300); rejected++; records.push(row); continue;
    }
    if(doc.schemaVersion!==config.collection.ingestSchemaVersion){
      row.status='STAGED_JSON_UNSUPPORTED_SCHEMA';
      row.detail=`schemaVersion=${doc.schemaVersion??'missing'}`; rawEvidence++; records.push(row); continue;
    }
    row.experiment_id=doc.experiment?.experimentId||null;
    try{
      const stdout=runNode(ingestScript,[rawPath,stagedRuns]);
      if(/No-op:/.test(stdout)){row.status='ALREADY_PRESENT_IDENTICAL';alreadyPresent++;}
      else{row.status='STAGED_NEW_IMMUTABLE_EXPERIMENT';newExperiments++;}
    }catch(e){
      row.status='REJECTED_SCHEMA_OR_IMMUTABILITY';
      row.detail=String(e.stderr||e.message||e).slice(0,700).trim();
      rejected++;
    }
    records.push(row);
  }

  let sheetSummary=null;
  const sheetConfig=config.structuredSources?.resourceCoachSheet;
  if(sheetConfig?.enabled){
    sheetSummary=await collectResourceCoachSheet({
      token,
      spreadsheetId:sheetConfig.spreadsheetId,
      stagedRuns,
      outDir,
      ingestScript,
    });
  }

  fs.mkdirSync(analysisDir,{recursive:true});
  runNode(analyseScript,['--corpus-dir',corpusDir,'--runs-dir',stagedRuns,'--out-dir',analysisDir,'--top-n','20']);
  const analysisSummary=JSON.parse(fs.readFileSync(path.join(analysisDir,'summary.json'),'utf8'));

  const summary={
    schemaVersion:'drive-data-collection-summary-v1',
    collectedAt:new Date().toISOString(),
    github:{
      repository:process.env.GITHUB_REPOSITORY||null,
      runId:process.env.GITHUB_RUN_ID||null,
      runAttempt:process.env.GITHUB_RUN_ATTEMPT||null,
      sha:process.env.GITHUB_SHA||null,
      ref:process.env.GITHUB_REF||null,
    },
    drive:{
      serviceAccountEmail:sa.client_email,
      incomingFolderId:config.folders.incoming,
      analysisOutputFolderId:config.folders.analysisOutput,
      quarantineFolderId:config.folders.quarantine,
      sourceFileCount:files.length,
      collectedBytes:totalBytes,
    },
    results:{newExperiments,alreadyPresent,rejected,rawEvidence,unsupported,sheet:sheetSummary},
    safeguards:{
      sourceFilesMoved:false,
      sourceFilesDeleted:false,
      repositoryMutated:false,
      immutableExperimentOverwriteAllowed:false,
    },
    analysis:analysisSummary,
  };
  fs.writeFileSync(path.join(outDir,'collection-manifest.json'),JSON.stringify({summary,files:records},null,2)+'\n');
  fs.writeFileSync(path.join(outDir,'collection-summary.json'),JSON.stringify(summary,null,2)+'\n');

  let receipt=null;
  if(config.writeBack?.uploadReceipt){
    const rid=process.env.GITHUB_RUN_ID||Date.now();
    receipt=await uploadJson(token,config.folders.analysisOutput,`github-collection-receipt-${rid}.json`,summary);
    fs.writeFileSync(path.join(outDir,'drive-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
  }

  console.log(JSON.stringify({
    authenticatedAs:sa.client_email,
    incomingFiles:files.length,
    newExperiments,
    alreadyPresent,
    rejected,
    rawEvidence,
    unsupported,
    sheet:sheetSummary,
    analysisCurrentExperiments:analysisSummary.currentExperimentRecords,
    receiptFileId:receipt?.id||null,
  },null,2));
}

if(import.meta.url===new URL(`file://${process.argv[1]}`).href){
  main().catch(err=>{console.error(err?.stack||err);process.exit(1);});
}
