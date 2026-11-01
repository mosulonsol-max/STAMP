"""Fail-closed regression tests for Solana RPC parsed instruction variants."""
import pathlib,sys,unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/"src"))
from evidence_sources import burn_instructions,CONTRACT
class EvidenceShapeTests(unittest.TestCase):
 def tx(self,parsed):
  return {"meta":{"err":None,"preTokenBalances":[],"postTokenBalances":[],"innerInstructions":[]},"transaction":{"message":{"accountKeys":[],"instructions":[{"program":"spl-token-2022","parsed":parsed}]}}}
 def test_string_parsed_instruction_is_ignored(self):
  self.assertEqual(burn_instructions(self.tx("invalid-json-parsed-shape")),[])
 def test_nonobject_info_is_ignored(self):
  self.assertEqual(burn_instructions(self.tx({"type":"burnChecked","info":"unexpected"})),[])
 def test_valid_burn_is_retained(self):
  rows=burn_instructions(self.tx({"type":"burnChecked","info":{"mint":CONTRACT,"amount":"42","account":"some-account"}}))
  self.assertEqual(len(rows),1)
  self.assertEqual(rows[0]["amount_raw"],"42")
 def test_invalid_transaction_is_rejected(self):
  self.assertEqual(burn_instructions(None),[])
if __name__=="__main__":unittest.main()
