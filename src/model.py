"""Walk-forward validated statistical ML; no forecasts without out-of-sample skill."""
import math
def predict(candles):
    if len(candles)<320:
        return {"status":"insufficient_data","reason":"need >=320 completed hourly candles"}
    try:
        import numpy as np
        from sklearn.ensemble import HistGradientBoostingRegressor
        from sklearn.metrics import mean_absolute_error
        X=[];y=[]
        for i in range(25,len(candles)-1):
            c=candles
            if min(z["c"] for z in c[i-24:i+2])<=0:continue
            f=[math.log(c[i-j]["c"]/c[i-j-1]["c"]) for j in (0,1,2,3,5,12,23)]
            f += [(c[i]["h"]-c[i]["l"])/c[i]["c"],math.log1p(c[i]["v"]),
                sum(c[k]["c"]/c[k-1]["c"]-1 for k in range(i-5,i+1))]
            X.append(f);y.append(math.log(c[i+1]["c"]/c[i]["c"]))
        if len(X)<280:return {"status":"insufficient_data","samples":len(X)}
        X=np.asarray(X);y=np.asarray(y);cut=len(y)-60
        # strictly forward validation: test last 60 hours, train only on earlier samples
        m=HistGradientBoostingRegressor(max_iter=80,max_leaf_nodes=7,l2_regularization=10,random_state=42)
        m.fit(X[:cut],y[:cut]);p=m.predict(X[cut:])
        mae=float(mean_absolute_error(y[cut:],p));baseline=float(mean_absolute_error(y[cut:],np.zeros_like(y[cut:])))
        if not math.isfinite(mae) or baseline==0 or mae>=baseline*0.90:
            return {"status":"unreliable","samples":len(y),"test_samples":60,"mae":mae,"zero_return_baseline_mae":baseline,"reason":"did not beat zero-return baseline by 10%"}
        residuals=np.abs(y[cut:]-p);q=float(np.quantile(residuals,.9))
        m.fit(X,y)
        i=len(candles)-1
        f=[math.log(candles[i-j]["c"]/candles[i-j-1]["c"]) for j in (0,1,2,3,5,12,23)]
        f += [(candles[i]["h"]-candles[i]["l"])/candles[i]["c"],math.log1p(candles[i]["v"]),sum(candles[k]["c"]/candles[k-1]["c"]-1 for k in range(i-5,i+1))]
        est=float(m.predict(np.asarray([f]))[0]);price=candles[-1]["c"]
        return {"status":"experimental_validated","horizon":"1h","samples":len(y),"test_samples":60,"mae":mae,
          "zero_return_baseline_mae":baseline,"predicted_return_log":est,
          "conditional_price_range_usd":[price*math.exp(est-q),price*math.exp(est+q)],
          "warning":"Residual interval is a heuristic, not a statistically calibrated 90% confidence interval. No live trading use."}
    except Exception as e:return {"status":"model_error","error":str(e)[:240]}
