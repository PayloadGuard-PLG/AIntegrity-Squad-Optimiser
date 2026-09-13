"""Synthetic-only independent numerical-quadrature reference; no player corpus.

Run with NumPy/SciPy to regenerate the checked-in fixture. The reference
integrates the cost function numerically and inverts it with Brent's method,
independently of the TypeScript piecewise analytical inverse.
"""
import json, math
from pathlib import Path
from scipy.integrate import quad
from scipy.optimize import brentq, least_squares
import numpy as np
root=Path(__file__).resolve().parents[2]
p=json.loads((root/'profiles/resource_coach_v2.json').read_text())['parameters']
def gain(u,age,x,z=1,dh=0,dl=0):
    S=p['highRateAge28']*math.exp(p['highAgeLogSlopePerYear']*(age-28)+dh)
    V=p['lowRateAge28']*math.exp(p['lowAgeLogSlopePerYear']*(age-28)+dl)
    h=p['K']*math.log(S/V)
    def integral(g):
        return quad(lambda v:max(math.exp(v/p['K'])/S,1/V),u,u+g,points=[h] if u<h<u+g else None,epsabs=1e-9)[0]
    upper=1
    while integral(upper)<x*z:upper*=2
    return brentq(lambda g:integral(g)-x*z,0,upper,xtol=1e-10)
rows=[]
for age in (18,24,28,31,32):
    for u,x in ((-40,.5),(0,13),(72,32.5),(150,53),(247,13),(399,1)):
        rows.append(dict(u=u,age=age,exposure=x,gain=[gain(u,age,x),gain(u,age,x,p['upperLatentRatio'])]))
# Synthetic two-stat anchor with deliberately displaced player rates.
coords=[80.,150.];age=28;x=13
observed=[[round(gain(u,age,x,z,.3,-.2),1) for z in [1,p['upperLatentRatio']]] for u in coords]
def objective(d):
    pred=[[gain(u,age,x,z,*d) for z in [1,p['upperLatentRatio']]] for u in coords]
    return np.r_[(np.log1p(pred)-np.log1p(observed)).ravel(),math.sqrt(.2)*d]
fit=least_squares(objective,[0.,0.],bounds=([-4,-4],[4,4]),max_nfev=1000)
(root/'tests/fixtures/resource-coach-v2-synthetic.json').write_text(json.dumps(dict(reference='synthetic numerical quadrature + Brent inversion; no player records',rows=rows,anchor=dict(coords=coords,age=age,exposure=x,observed=observed,offsets=fit.x.tolist())),indent=2)+'\n')
