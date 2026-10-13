"""Generate a dedicated pilot assessor credential; never replace AUTOMATION_CLIENTS."""
import os,json,secrets,hashlib,argparse
p=argparse.ArgumentParser();p.add_argument('--service-file',required=True);p.add_argument('--learner-id',required=True);a=p.parse_args()
c=json.load(open(a.service_file));assert c.get('environment')=='staging'
site=c['site'];key=secrets.token_hex(32);client_id='assessor-unhuman-staging'
client={'id':client_id,'keySha256':hashlib.sha256(key.encode()).hexdigest(),'accessClientId':site['HUB_BRIDGE_ACCESS_CLIENT_ID'],'scopes':['jobs:assess','attachments:read'],'learnerIds':[a.learner_id],'purposes':['submission','recheck'],'triggers':['scheduled','on_demand','deferred']}
folder='private-data/h7-h8';os.makedirs(folder,exist_ok=True)
for name,data in [('assessor-client.json',client),('assessor-worker-secrets.json',{'HUB_AUTOMATION_BEARER':'Bearer lhk_'+client_id+'_'+key,'ACCESS_CLIENT_ID':site['HUB_BRIDGE_ACCESS_CLIENT_ID'],'ACCESS_CLIENT_SECRET':site['HUB_BRIDGE_ACCESS_CLIENT_SECRET']})]:
 path=folder+'/'+name
 if os.path.exists(path):raise SystemExit('Credential already prepared. Do not silently rotate; reuse the private file or explicitly rotate.')
 with open(path,'w') as f:json.dump(data,f)
 os.chmod(path,0o600)
print('Prepared dedicated assessor credential privately. Existing clients untouched; no upload/model call.')
