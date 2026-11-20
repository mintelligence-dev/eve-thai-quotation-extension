# Thai Quotation Agent

An [eve](https://eve.dev) agent that drafts Thai and English quotations from a customer's message, priced from the shop's own catalog, and issues one only after a person approves. It is a working example of [`@eve-thai-quotation-extension/eve`](https://github.com/mintelligence-dev/eve-thai-quotation-extension/tree/main/packages/eve): the agent was made with `eve init`, the quotation tools were added with `eve add`, and everything else here is the web page and the Telegram channel around them.

Live: <https://thai-quotation-agent.vercel.app> · Telegram: [@thai_quotation_bot](https://t.me/thai_quotation_bot) (a test bot)

## What you can do with it

| Where | What happens |
|---|---|
| **Web, steps 1–2** (`/`) | Choose a catalog (the shop's, a sample, or upload a CSV), paste the customer's message, choose "AI" or "no AI", and get a draft. |
| **Web, steps 3–4** (`/q/<token>`) | Check each line, change the item or quantity, add or remove lines, set VAT and the document details, tick "I checked", approve. Then print or save as PDF, or download CSV. |
| **Telegram** | Send the customer's message to the bot. It replies with the draft, asks about unclear lines, gives the link to the same draft on the web, and shows Approve / Deny buttons before it issues. |
| **Shop catalog** (`/catalog`) | See every item, change a price, replace the whole catalog with a CSV, download it, undo the last change. Needs the admin password. |
| **Shop catalog in Telegram** | An admin sends a `.csv` file to the bot, or `/price <sku> <price>`. `/catalog` shows the status, `/myid` shows your Telegram user id. |

Prices always come from a catalog. The model reads messages; it never writes a price, and catalog changes in Telegram are handled by code, not by the model.

## How it fits together

```
Web page ───────────┐
                    ├─→ agent (model reads the message) ─→ quotation tools ─→ draft in storage, with a link
Telegram ───────────┘                                                              │
                                              draft page on the web  ←─────────────┘
                                              (edits and approval, no model)
```

- `agent/extensions/quotation.ts` mounts the extension. `quotation.config.ts` holds its settings, shared with the web app.
- `quotation.desk.ts` opens the extension's `desk`: the same rules as the tools, for code that works on a draft without a model.
- `apps/web` is the Next.js app (Mintel UI theme). "AI" mode calls the agent from the server; "no AI" mode uses the built-in rules and costs nothing.
- `agent/channels/telegram.ts` is the Telegram channel, with the admin commands.
- Drafts and stored catalogs live in a private Vercel Blob store in production, and in `.data/` on your machine.

## Run it locally

Needs Node 24 or newer and Vercel CLI 59.16 or newer. This folder is a project of its own, not part of the repository's npm workspace: copy it out, or run the commands from inside it.

```bash
cp .env.example .env.local   # then fill in what you need
npm install
npx vercel@latest dev --local --listen 4320   # the web app and the agent together
```

Open <http://localhost:4320>. "No AI" mode works straight away. "AI" mode needs model access: link a Vercel project (`npx eve link`) or put `AI_GATEWAY_API_KEY` in `.env.local`.

Stopping `vercel dev` can leave its child processes running and still serving old code. If a change does not show up, check for leftover `next dev` and `eve` processes from this folder.

## Deploy to Vercel

```bash
npx eve link --project <name> --team <team>
npx vercel@latest blob create-store <store-name> --access private --yes
npx eve deploy --yes
```

Then set these for Production (`vercel env add <NAME> production`) and deploy again:

| Variable | Needed | What it is |
|---|---|---|
| `BLOB_READ_WRITE_TOKEN` | yes | Added by `blob create-store`. Without it, drafts would be written to a folder that does not persist on Vercel. |
| `QUOTATION_ADMIN_PASSWORD` | for `/catalog` | The password for the catalog page. Without it the page stays locked in production. |
| `TELEGRAM_BOT_TOKEN` | for Telegram | From [@BotFather](https://t.me/BotFather). |
| `TELEGRAM_WEBHOOK_SECRET_TOKEN` | for Telegram | Any long random string. Requests without it are refused. |
| `QUOTATION_ADMIN_TELEGRAM_IDS` | for catalog changes in Telegram | Comma-separated Telegram user ids. Nobody can change prices in Telegram until this is set. |
| `AI_GATEWAY_API_KEY` | recommended | An AI Gateway key with a spending cap. Without it the deployment uses the project's own AI Gateway access, with no cap. |
| `QUOTATION_WEB_URL` | only with a custom domain | The address draft links are built from. Defaults to the project's production URL. |

Register the Telegram webhook once:

```bash
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://<your-domain>/eve/v1/telegram","secret_token":"'"$TELEGRAM_WEBHOOK_SECRET_TOKEN"'","allowed_updates":["message","callback_query"]}'
```

The starting catalog is `data/starter-catalog.ts` (the same items as `data/catalog.csv`). After deploying, replace it on `/catalog` or by sending a CSV to the bot; you do not need to redeploy to change prices.

## Who can do what

Read this before you put real prices or customers into a deployment.

- **Anyone with the address** can make drafts in both modes, and can upload a catalog for their own draft. "AI" mode spends model credit, so set a capped key.
- **Anyone with a draft's link** can read that draft, change it, and approve it. There is no sign-in on draft pages. Links are unguessable (128 random bits) and stop working after 30 days, but treat a link like the document itself.
- **The shop's catalog** can be changed only with the admin password on the web, or by the listed admins in a private Telegram chat.
- **In Telegram**, the person talking to the bot approves their own quotation (`approval: { by: "requester" }`). That suits a bot your own staff use. For a bot customers talk to, switch to `{ by: "approvers", principals: [...] }` in `agent/extensions/quotation.ts`.
- **The agent itself** is not open to browsers in production. The web page reaches it from the server, and only to make a draft.
- Two people changing the same draft at the same moment can overwrite each other.

## What was tested

On the deployed site, in a browser: a mixed Thai and English message in "AI" mode produced six matched lines; document details were saved; approving produced quotation `QT-20261120-191257` with the right total. The catalog page asks for the password, the agent's session route refuses outside callers, and the Telegram route refuses a request without the secret.

Locally: "no AI" mode gave the same lines, statuses and questions as the earlier web demo on its samples; changing a price on `/catalog`; the storage layer against the real private Blob store.

Not tested: a real conversation with the Telegram bot on the deployment, the Telegram admin commands as a real admin, uploading a CSV file through the button, printing, the downloaded CSV, phones, dark mode on the reworked pages, and the spending cap actually stopping requests.

## Known gaps

- No PDF is generated on the server, so the bot sends the quotation as text, not as a file.
- The item picker on a draft line is a simple list, not Mintel UI's combobox, and the date field is the browser's own.
- An approved quotation cannot be reopened.

## License

MIT. Sample catalogs and messages are made up.
