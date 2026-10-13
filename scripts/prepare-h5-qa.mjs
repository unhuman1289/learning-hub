import { randomBytes, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { berlinBackupDay } from '../lib/backup-schedule.mjs';
import { hashPassword } from 'better-auth/crypto';
import { memoryDb } from '../tests/d1-adapter.mjs';
// Creates private, synthetic QA data only. Execute flags are separate from preparation.
const args = process.argv.slice(2),
  staging = args.includes('--staging'),
  oldFile = args.includes('--bridge-secrets') ? args[args.indexOf('--bridge-secrets') + 1] : null;
if (staging && !oldFile) throw Error('Staging requires a private bridge secrets file; never paste credentials into chat.');
const old = staging ? JSON.parse(readFileSync(oldFile, 'utf8')) : null;
if (staging && (!Array.isArray(old.workerClients) || old.environment !== 'staging')) throw Error('Wrong bridge configuration environment.');
const suffix = randomBytes(10).toString('hex'),
  owner = 'qa-h5-' + suffix,
  other = owner + '-other',
  subject = 'sub_' + suffix,
  folder = 'private-data/h5-qa-' + suffix,
  password = randomBytes(32).toString('base64url'),
  secret = randomBytes(32).toString('base64url'),
  clientId = 'h5-qa-' + suffix;
mkdirSync(folder, { recursive: true, mode: 0o700 });
const write = (name, data) =>
  writeFileSync(folder + '/' + name, typeof data === 'string' ? data : JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
const stamp = Date.now(),
  db = memoryDb();
for (const id of [owner, other]) {
  db.sqlite
    .prepare("INSERT INTO user(id,name,email,email_verified,created_at,updated_at,role,status) VALUES(?,'QA H5',?,1,?,?,'learner','active')")
    .run(id, id + '@example.test', stamp, stamp);
  db.sqlite
    .prepare("INSERT INTO account(id,account_id,provider_id,user_id,password,created_at,updated_at) VALUES(?,?,'credential',?,?,?,?)")
    .run(id, id, id, await hashPassword(password), stamp, stamp);
}
db.sqlite
  .prepare("INSERT INTO learner_settings(user_id,daily_target_minutes,updated,role,display_name) VALUES(?,60,?,'adult','Học thử H5')")
  .run(owner, new Date(stamp).toISOString());
db.sqlite
  .prepare(
    "INSERT INTO subjects(id,learner_id,title,template,status,ai_enabled,goal,level,created_by,created_at,updated_at) VALUES(?,?,'QA H5 Deutsch','skill','active',1,'Thử API H5; không đánh giá năng lực','A2',?,?,?)",
  )
  .run(subject, owner, owner, new Date(stamp).toISOString(), new Date(stamp).toISOString());
const quote = (x) => (x === null ? 'NULL' : typeof x === 'number' ? String(x) : "'" + x.replaceAll("'", "''") + "'");
let sql = '';
for (const table of ['user', 'account', 'learner_settings', 'subjects'])
  for (const row of db.sqlite.prepare('SELECT * FROM ' + table).all())
    sql += `INSERT INTO ${table} (${Object.keys(row).join(',')}) VALUES (${Object.values(row).map(quote).join(',')});\n`;
db.sqlite.close();
write('seed.sql', sql);
const environment = staging ? 'staging' : 'local',
  origin = staging ? 'https://learning-hub-staging.tranvu-812.workers.dev' : 'http://localhost:8871';
const client = {
  id: clientId,
  keySha256: createHash('sha256').update(secret).digest('hex'),
  accessClientId: staging ? old.site.HUB_BRIDGE_ACCESS_CLIENT_ID : 'local-test-access-client',
  scopes: ['jobs:plan', 'jobs:assess', 'attachments:read'],
  purposes: ['daily', 'initial', 'request', 'submission', 'recheck'],
  triggers: ['scheduled', 'on_demand', 'deferred'],
  learnerIds: [owner],
};
const clients = [...(staging ? old.workerClients : []), client];
if (clients.length > 32) throw Error('Too many clients.');
const credentials = {
  bearer: 'Bearer lhk_' + clientId + '_' + secret,
  accessClientId: staging ? old.site.HUB_BRIDGE_ACCESS_CLIENT_ID : undefined,
  accessClientSecret: staging ? old.site.HUB_BRIDGE_ACCESS_CLIENT_SECRET : undefined,
  expectedLearnerRef:
    'lrn_' +
    createHash('sha256')
      .update(environment + ':' + owner)
      .digest('hex')
      .slice(0, 12),
};
write('secrets.json', { AUTOMATION_CLIENTS: JSON.stringify(clients) });
write('credentials.json', credentials);
write('manifest.json', {
  environment,
  origin,
  learnerId: owner,
  learnerIds: [owner, other],
  subjectId: subject,
  email: owner + '@example.test',
  otherEmail: other + '@example.test',
  password,
  credentials,
});
write(
  'job.sql',
  `INSERT INTO ai_jobs(id,kind,purpose,trigger,learner_id,learning_day,priority,status,dedupe_key,created_at,updated_at,expires_at) VALUES ('job_${suffix}','plan','daily','scheduled',${quote(owner)},${quote(berlinBackupDay(new Date(stamp)))},40,'queued',${quote('qa:' + suffix)},${quote(new Date(stamp).toISOString())},${quote(new Date(stamp).toISOString())},${quote(new Date(stamp + 2 * 3600000).toISOString())});\n`,
);
console.log(JSON.stringify({ prepared: folder, environment, secretValuesDisplayed: false, executed: false }));
