import quotation from "@eve-thai-quotation-extension/eve";

export default quotation({
  // Your price list. Columns: sku, name, unit, unit_price (required); name_en, aliases, category.
  // { path } reads a file in the project, { url } fetches one (re-read every 5 minutes),
  // { csv } takes the text itself.
  catalog: { path: "data/catalog.csv" },

  // Who may approve a quotation before it is issued. Nobody can until you set this:
  //   { by: "requester" }                        the person talking to the agent. Only for
  //                                              agents that your own staff talk to.
  //   { by: "approvers", principals: ["…"] }     these people only. Use this when customers
  //                                              talk to the agent.
  approval: { by: "approvers", principals: ["REPLACE_WITH_A_PRINCIPAL_ID"] },

  sellerName: "",
  // vatRateBps: 700,          // 7%
  // pricesIncludeVat: false,
  // validDays: 30,
});
