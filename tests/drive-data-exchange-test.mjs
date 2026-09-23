import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  base64url,
  parseServiceAccount,
  signAssertion,
  classifyFile,
  safeName,
} from '../tools/drive-data-exchange/collect-resource-coach.mjs';

test('service-account parsing requires credential material', () => {
  assert.throws(()=>parseServiceAccount(''),/secret is missing/);
  assert.throws(()=>parseServiceAccount('{}'),/client_email/);
  const x=parseServiceAccount(JSON.stringify({client_email:'svc@example.test',private_key:'key'}));
  assert.equal(x.client_email,'svc@example.test');
});

test('JWT assertion carries Drive scope without embedding private key', () => {
  const {privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
  const privatePem=privateKey.export({type:'pkcs8',format:'pem'}).toString();
  const jwt=signAssertion({
    client_email:'svc@example.test',
    private_key:privatePem,
    token_uri:'https://oauth2.googleapis.com/token',
  },1700000000);
  const [header,payload]=jwt.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(header,'base64url').toString()),{alg:'RS256',typ:'JWT'});
  const claims=JSON.parse(Buffer.from(payload,'base64url').toString());
  assert.equal(claims.iss,'svc@example.test');
  assert.equal(claims.scope,'https://www.googleapis.com/auth/drive');
  assert.equal(claims.aud,'https://oauth2.googleapis.com/token');
  assert.doesNotMatch(jwt,/BEGIN PRIVATE KEY/);
});

test('collection classification is explicit and conservative', () => {
  const config={collection:{rawEvidenceExtensions:['.json','.csv','.xlsx','.png','.jpg','.zip']}};
  assert.equal(classifyFile({name:'run.json',mimeType:'application/json'},config),'JSON');
  assert.equal(classifyFile({name:'card.png',mimeType:'image/png'},config),'RAW_EVIDENCE');
  assert.equal(classifyFile({name:'notes.txt',mimeType:'text/plain'},config),'UNSUPPORTED');
  assert.equal(classifyFile({name:'nested',mimeType:'application/vnd.google-apps.folder'},config),'FOLDER');
});

test('raw source names are path-safe', () => {
  assert.equal(safeName('../../bad name?.json'),'.._.._bad_name_.json');
  assert.equal(base64url(Buffer.from([255,254,253])),'__79');
});
