"""Compatibility entry point using the same research engine as UI and journal."""
def predict(candles):
    from prediction_engine import evaluate
    return evaluate(candles,"1h")
