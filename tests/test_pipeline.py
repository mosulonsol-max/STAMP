import pathlib,sys,unittest,datetime as dt,tempfile,json
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/"src"))
import market_features as mf
import forecast_audit as fa
import research_engine as re
import adaptive_feedback as af
import tradingview_features as tv
class Features(unittest.TestCase):
 def test_tradingview_signal_validation(self):
  event={'schema':'stamp.tv.signal.v1','symbol':'MEXC:STAMPUSDT','timeframe':'60','bar_time_ms':1792660000000,'signal':'bullish','close':.0002,'ema_fast':.00021,'ema_slow':.00019,'rsi':56,'macd_hist':.000001}
  self.assertEqual(tv.validate(event)['signal'],'bullish')
  event['rsi']=float('nan')
  with self.assertRaises(ValueError):tv.validate(event)

 def test_feedback_requires_matured_outcomes(self):
  self.assertEqual(af.calibrate([], 'x', .03)['prediction'], .03)
  rows=[{'event':'forecast','id':str(i),'model_version':'x','predicted_log_return':.1} for i in range(25)]
  rows += [{'event':'outcome','forecast_id':str(i),'status':'evaluated','actual_log_return':0.0} for i in range(25)]
  self.assertEqual(af.calibrate(rows,'x',.03)['prediction'],0.0)
 def test_scorecard_without_outcomes(self):
  with tempfile.TemporaryDirectory() as d:
   s=re.score(pathlib.Path(d))
   self.assertEqual(s['evaluated_total'],0)
 def test_book(self):
  b=mf.orderbook({"bids":[["1.0","10"],["0.99","5"]],"asks":[["1.01","20"],["1.02","2"]]})
  self.assertEqual(b["status"],"snapshot")
  self.assertLess(b["depth_100bps"]["imbalance"],0)
 def test_trade_sides_and_dedup(self):
  t=[{"id":1,"price":"2","qty":"3","isBuyerMaker":False},{"id":1,"price":"2","qty":"3","isBuyerMaker":False},{"id":2,"price":"2","qty":"1","isBuyerMaker":True}]
  r=mf.trades(t);self.assertEqual(r["aggressive_buy_notional_usdt"],6);self.assertEqual(r["aggressive_sell_notional_usdt"],2)
 def test_indicators(self):
  candles=[{"c":1+i*.001,"h":1.01+i*.001,"l":.99+i*.001,"v":100+i} for i in range(220)]
  a=mf.technical(candles);self.assertEqual(a["status"],"descriptive");self.assertIsNotNone(a["ema200"])
 def test_forecast_outcome(self):
  with tempfile.TemporaryDirectory() as d:
   old=fa.JOURNAL;fa.JOURNAL=pathlib.Path(d)/"journal.jsonl"
   try:
    now=dt.datetime(2026,10,22,12,tzinfo=dt.timezone.utc)
    fa.append({"event":"forecast","id":"a","due_at_utc":now.isoformat(),"reference_price":1.0,"predicted_log_return":0.01})
    fa.evaluate(fa.read(),now+dt.timedelta(minutes=3),1.02)
    out=[x for x in fa.read() if x.get("event")=="outcome"]
    self.assertEqual(len(out),1);self.assertTrue(out[0]["direction_correct"])
    fa.evaluate(fa.read(),now+dt.timedelta(minutes=4),1.02)
    self.assertEqual(len([x for x in fa.read() if x.get("event")=="outcome"]),1)
   finally:fa.JOURNAL=old
if __name__=="__main__":unittest.main()
