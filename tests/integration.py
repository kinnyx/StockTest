"""Run against a fresh disposable database: python3 tests/integration.py"""
import json
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor

BASE = 'http://localhost:5000/api'
def request(path, method='GET', body=None, expected=200):
    req = urllib.request.Request(BASE+path, data=None if body is None else json.dumps(body).encode(), method=method, headers={'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            status, data = response.status, json.load(response)
    except urllib.error.HTTPError as error:
        status, data = error.code, json.load(error)
    assert status == expected, (path, status, data)
    return data

def products(): return {p['code']:p for p in request('/products')}
def cart(): return request('/carts','POST')['id']
def put(c, code, qty, status=200): return request(f'/carts/{c}/items/{code}','PUT',{'quantity':qty}, status)

initial = products()
assert initial['P001']['onHand'] == 10 and initial['P001']['reserved'] == 0, 'Use a fresh demo database'
a, b = cart(), cart()
put(a,'P001',2)
assert products()['P001']['available'] == 8
put(a,'P001',11,409)
assert products()['P001']['reserved'] == 2
put(a,'P001',-1,400)
put(a,'UNKNOWN',1,404)
put(a,'P006',1,409)
put(a,'P001',1)
assert products()['P001']['available'] == 9
request(f'/carts/{a}/items/P001','DELETE')
assert products()['P001']['available'] == 10
put(a,'P001',2); put(a,'P002',1)
request(f'/carts/{a}/items','DELETE')
assert products()['P001']['reserved'] == products()['P002']['reserved'] == 0
request(f'/carts/{a}/checkout','POST',expected=400)
# Two customers compete for two monitors: one succeeds, one gets HTTP 409.
def compete(c):
    try:
        put(c,'P004',2)
        return c
    except AssertionError as e:
        assert e.args[0][1] == 409, e
        return None
with ThreadPoolExecutor(max_workers=2) as pool:
    winners = [c for c in pool.map(compete,[a,b]) if c]
assert len(winners) == 1
winner = winners[0]
assert products()['P004']['available'] == 0
# Concurrent checkout retry must create one order and deduct stock exactly once.
with ThreadPoolExecutor(max_workers=2) as pool:
    receipts = list(pool.map(lambda _: request(f'/carts/{winner}/checkout','POST'), range(2)))
assert receipts[0] == receipts[1]
assert receipts[0]['total'] == 11980
assert receipts[0]['items'][0]['quantity'] == 2
assert products()['P004']['onHand'] == products()['P004']['reserved'] == 0
assert request(f'/carts/{winner}')['items'] == []
put(winner,'P001',1,409)
assert request(f'/carts/{winner}/checkout','POST') == receipts[0]
print('PASS: stock limit, release, clear, empty checkout, concurrent carts, checkout idempotency, totals')
