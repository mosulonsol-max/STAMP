"""Wallet balances are real public reads; this module cannot sign or submit trades."""
import base64
import http.client
import json
import os
import threading
import unittest
from http.server import ThreadingHTTPServer
from unittest.mock import patch

from src import wallet_observer as wallet
from src import private_dashboard as app

OWNER="11111111111111111111111111111111"


def account(mint, raw, decimals):
    return {"account":{"data":{"parsed":{"info":{
        "mint":mint,"tokenAmount":{"amount":str(raw),"decimals":decimals}
    }}}}}


class WalletObserverTests(unittest.TestCase):
    def setUp(self):
        wallet._CACHE.clear()

    def test_validates_exact_public_key_and_token_programs(self):
        self.assertEqual(wallet.public_key(OWNER),OWNER)
        for address in ("", "0"*44, "1"*31, "1"*33, "x"*100, "private key"):
            with self.assertRaisesRegex(ValueError,"invalid_public_address"):
                wallet.public_key(address)
        self.assertEqual(wallet.TOKEN_PROGRAMS[1],"TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb")

    def test_aggregates_both_programs_with_exact_decimal_amounts_and_no_trade_claim(self):
        calls=[]
        def fake_rpc(method,params):
            calls.append((method,params))
            if method=="getBalance":return {"value":1234567890}
            program=params[1]["programId"]
            if program==wallet.TOKEN_PROGRAMS[1]:
                return {"value":[account(wallet.STAMP_MINT,10000001,6),account(wallet.STAMP_MINT,2500000,6)]}
            return {"value":[account("So11111111111111111111111111111111111111112",1000000000,9)]}
        with patch.object(wallet,"rpc",side_effect=fake_rpc):
            result=wallet.observe(OWNER)
            self.assertEqual(wallet.observe(OWNER),result)
        self.assertEqual(len(calls),3)
        self.assertEqual(result["sol"],"1.23456789")
        self.assertEqual(result["stamp"],"12.500001")
        self.assertEqual(result["tokens"][0]["raw_amount"],"12500001")
        self.assertEqual(result["mode"],"read_only")
        self.assertEqual(result["execution"],"disabled_no_signer")
        self.assertIsNone(result["profit_loss"])

    def test_rpc_failure_does_not_display_fake_zero_balance(self):
        with patch.object(wallet,"rpc",side_effect=OSError("RPC unavailable")):
            with self.assertRaises(OSError):wallet.observe(OWNER)

    def test_authenticated_api_denies_anonymous_and_rejects_invalid_address(self):
        with patch.dict(os.environ,{"DASHBOARD_USER":"private","DASHBOARD_PASSWORD":"long-test-password"},clear=True):
            server=ThreadingHTTPServer(("127.0.0.1",0),app.Handler)
            worker=threading.Thread(target=server.serve_forever,daemon=True);worker.start()
            try:
                conn=http.client.HTTPConnection("127.0.0.1",server.server_address[1],timeout=3)
                conn.request("GET","/api/wallet/observe?address="+OWNER)
                response=conn.getresponse();self.assertEqual(response.status,401);response.read()
                auth={"Authorization":"Basic "+base64.b64encode(b"private:long-test-password").decode()}
                conn.request("GET","/api/wallet/observe?address=not-a-wallet",headers=auth)
                response=conn.getresponse();self.assertEqual(response.status,400)
                self.assertEqual(json.loads(response.read())["error"],"invalid_public_address")
                with patch.object(app,"observe_wallet",return_value={"address":OWNER,"mode":"read_only"}) as observe:
                    conn.request("GET","/api/wallet/observe?address="+OWNER,headers=auth)
                    response=conn.getresponse();self.assertEqual(response.status,200)
                    self.assertEqual(json.loads(response.read())["address"],OWNER)
                    observe.assert_called_once_with(OWNER)
                conn.close()
            finally:
                server.shutdown();server.server_close();worker.join(timeout=3)


if __name__=="__main__":unittest.main()
