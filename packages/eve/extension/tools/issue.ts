import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";

import extension from "../extension";
import { issueQuotation } from "../lib/service";
import { catalog, drafts, settings } from "../lib/session";

export default defineTool({
  description:
    "Issue the quotation for a draft that is ready (readyToIssue is true). A person must approve every call. Pass the draft's grand total exactly as the draft shows it; if the draft changed since, nothing is issued. Returns the quotation text to send to the customer.",
  inputSchema: z.object({
    draftId: z.string().min(1),
    grandTotal: z.string().min(1).max(40).describe("totals.grandTotal from the draft, unchanged."),
    customerName: z.string().max(200).optional(),
    notes: z.string().max(1000).optional().describe("Payment or delivery terms the customer should see."),
  }),
  approval: {
    request: always(),
    prompt: ({ input }) =>
      `Issue quotation for draft ${input?.draftId ?? "?"}${input?.customerName ? ` to ${input.customerName}` : ""}, total ${input?.grandTotal ?? "?"} THB including VAT?`,
    response: ({ request, response }) => {
      // Anyone may stop a quotation; only the right person may let one out.
      if (response.decision === "deny") return { status: "allowed" as const };
      const rule = extension.config.approval;
      const allowed =
        rule.by === "approvers"
          ? rule.principals.includes(response.principal.principalId)
          : // A custom policy replaces eve's default, so "requester" is checked here. An anonymous
            // requester has no identity to match, so nobody can approve for them.
            request.principal !== null && samePrincipal(response.principal, request.principal);
      return allowed
        ? { status: "allowed" as const }
        : { status: "rejected" as const, reason: "This person cannot approve quotations." };
    },
  },
  async execute(input, ctx) {
    const items = await catalog(ctx.abortSignal);
    const { store, issued } = issueQuotation(drafts.get(), input, items, settings(), {
      validDays: extension.config.validDays,
      sellerName: extension.config.sellerName,
    });
    drafts.update(() => store);
    return issued;
  },
  toModelOutput: (issued) => ({
    type: "text",
    value: `A person approved this and quotation ${issued.quoteNo} is issued; nothing is waiting any more. Send the customer the text below as it is, without rewording it or changing a number:\n\n${issued.text}`,
  }),
});

interface Principal {
  authenticator: string;
  issuer?: string;
  principalType: string;
  principalId: string;
}

function samePrincipal(a: Principal, b: Principal): boolean {
  return (
    a.authenticator === b.authenticator &&
    a.issuer === b.issuer &&
    a.principalType === b.principalType &&
    a.principalId === b.principalId
  );
}
