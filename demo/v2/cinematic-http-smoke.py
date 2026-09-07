"""Read/write only the stateless local simulation endpoint; no external transport."""
import json
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

import os
BASE = os.environ.get('STARRYLINK_QA_URL', 'http://127.0.0.1:8884')
OUT = Path(__file__).resolve().parents[2] / 'docs' / 'scenario-causality-20260906'

def post(body):
    req = Request(BASE+'/api/v2/scenario', json.dumps(body).encode(), {'Content-Type':'application/json'})
    with urlopen(req, timeout=15) as response:
        return json.load(response)

results=[]
for scenario in ('disaster','conflict'):
    state=post({'scenarioId':scenario})
    assert state['mode']=='simulation'
    assert state['engineVersion']=='starrylink-mission-2.2.0'
    assert [f['seconds'] for f in state['timeline']['frames'][:5]]==([0,4,6,8,10] if scenario=='conflict' else [0,3,5,8,11])
    assert state['timeline']['frames'][1]['failures']==[]
    assert state['timeline']['frames'][11]['routeStatus']=='LOCKED'
    assert state['deliveryStatus']['confirmed'] is True
    assert state==post({'scenarioId':scenario})
    top=state['recommendation']['routeId']
    failed=post({'scenarioId':scenario,'excludedRouteIds':[top]})
    assert failed['recommendation']['routeId']==state['recommendation']['fallbackRouteId']
    missing=post({'scenarioId':scenario,'dropAck':True})
    assert missing['deliveryStatus']['status']=='ACK_TIMEOUT'
    assert missing['deliveryStatus']['confirmed'] is False
    assert missing['timeline']['frames'][11]['routeStatus']=='ACK_TIMEOUT'
    assert not any(f['confirmed'] for f in missing['timeline']['frames'])
    (OUT/f'{scenario}-evidence.json').write_text(json.dumps(state,ensure_ascii=False,indent=2))
    results.append({'scenario':scenario,'inputHash':state['inputHash'],'candidates':len(state['candidates']),'selected':top,'fallback':failed['recommendation']['routeId'],'delivery':state['deliveryStatus']['status'],'retry':state['deliveryStatus']['retry'],'ackLoss':missing['deliveryStatus']['status']})
blocked=post({'scenarioId':'disaster','controls':{'power':0}})
assert blocked['recommendation']['routeId'] is None
assert blocked['deliveryStatus']['status']=='BLOCKED_NO_ROUTE'
try:
    post({'scenarioId':'invented-live-source'})
    raise AssertionError('invalid input accepted')
except HTTPError as error:
    assert error.code==400
health=json.load(urlopen(BASE+'/api/health',timeout=10))
legacy=json.load(urlopen(BASE+'/api/resilience',timeout=10))
assert health['status']=='ok'
assert legacy['engineVersion']=='starrylink-resilience-1.0.0'
summary={'localEndpoint':BASE,'scenarios':results,'zeroPower':'BLOCKED_NO_ROUTE','invalidRequest':400,'legacyEngine':legacy['engineVersion'],'health':health['status']}
(OUT/'http-smoke.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2))
print(json.dumps(summary,ensure_ascii=False,indent=2))
