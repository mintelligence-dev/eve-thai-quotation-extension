import quotation from "@eve-thai-quotation-extension/eve";

import { quotationConfig } from "../../quotation.config";

export default quotation({
  ...quotationConfig,

  // Who may approve a quotation before it is issued in chat:
  //   { by: "requester" }                        the person talking to the agent. Only for
  //                                              agents that your own staff talk to.
  //   { by: "approvers", principals: ["…"] }     these people only. Use this when customers
  //                                              talk to the agent.
  approval: { by: "requester" },
});
