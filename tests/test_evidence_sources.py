"""Regression tests for heterogeneous Solana JSON-parsed instructions."""
import pathlib,sys,unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/"src"))
from evidence_sources import burn_instructions,CONTRACT

class BurnParsingTests(unittest.TestCase):
 def test_string_parsed_instruction_does_not_crash_or_forge_burn(self):
  tx={"meta":{"err":None,"preTokenBalances":[],"postTokenBalances":[],"innerInstructions":[]},
      "transaction":{"message":{"accountKeys":[],"instructions":[
       {"program":"spl-token","parsed":"opaque-transaction"},
       {"program":"spl-token","parsed":None},
       {"program":"spl-token","parsed":{"type":"burn","info":{"mint":CONTRACT,"amount":"25","account":"holder"}}}
      ]}}}
  events=burn_instructions(tx)
  self.assertEqual(len(events),1)
  self.assertEqual(events[0]["amount_raw"],"25")
 def test_malformed_info_and_instructions_are_skipped(self):
  tx={"meta":{"err":None,"preTokenBalances":[],"postTokenBalances":[],"innerInstructions":[]},
      "transaction":{"message":{"accountKeys":[],"instructions":[
       None,"bad",{"program":"spl-token","parsed":{"type":"burn","info":"text"}},
       {"program":"spl-token","parsed":{"type":"burn","info":{"mint":"other","amount":"3"}}}
      ]}}}
  self.assertEqual(burn_instructions(tx),[])
if __name__=="__main__":unittest.main()
