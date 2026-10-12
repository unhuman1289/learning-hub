#!/usr/bin/env python3
"""Prepare staging-only credentials locally; never print their values or deploy."""
import getpass
import hashlib
import json
import os
from pathlib import Path
import re
import secrets

root = Path(__file__).resolve().parents[1]
target = root / 'private-data' / 'sites-bridge-staging-secrets.json'
if target.exists():
    raise SystemExit('File da ton tai; khong ghi de hay tao khoa moi. Bao Codex kiem tra file hien co.')
print('Chi nhap khoa Service Token staging. Gia tri se khong hien tren man hinh.')
client_id = getpass.getpass('Cloudflare Client ID: ').strip()
client_secret = getpass.getpass('Cloudflare Client Secret: ').strip()
if not re.fullmatch(r'[A-Za-z0-9.-]{8,128}', client_id):
    raise SystemExit('Client ID khong dung dinh dang. Chua luu gi.')
if not re.fullmatch(r'[A-Za-z0-9._~-]{32,256}', client_secret):
    raise SystemExit('Client Secret khong dung dinh dang. Chua luu gi.')
client_name = 'sites-bridge-staging'
bearer_secret = secrets.token_urlsafe(48)
values = {
    'site': {
        'HUB_BRIDGE_ACCESS_CLIENT_ID': client_id,
        'HUB_BRIDGE_ACCESS_CLIENT_SECRET': client_secret,
        'HUB_BRIDGE_BEARER': f'lhk_{client_name}_{bearer_secret}',
    },
    'workerClients': [{
        'id': client_name,
        'keySha256': hashlib.sha256(bearer_secret.encode()).hexdigest(),
        'scopes': ['runs:create', 'context:read', 'result:write'],
        'accessClientId': client_id,
    }],
    'environment': 'staging',
}
target.parent.mkdir(parents=True, exist_ok=True)
fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w') as output:
    json.dump(values, output, indent=2)
    output.write('\n')
print('Da luu kin trong private-data/sites-bridge-staging-secrets.json (quyen 0600, Git bo qua).')
print('Chua upload, deploy hay thay doi dich vu. Bao Codex: da nhap khoa staging.')
